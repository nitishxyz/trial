import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { db } from "../../db";
import { tradesTable, usersTable, pnlRecordsTable } from "../../db/schema";
import { eq, and } from "drizzle-orm";

export class WalletMonitorService {
  private connection: Connection;
  private activeWallets: Set<string> = new Set();
  private static instance: WalletMonitorService;
  private lastSignatures: Map<string, string> = new Map();
  private pollingInterval: NodeJS.Timeout | null = null;
  private userCache: Map<string, typeof usersTable.$inferSelect> = new Map();
  private readonly PST_OFFSET = -8; // PST is UTC-8
  private dailyPnLCache: Map<
    string,
    {
      date: Date;
      startBalance: number;
      currentBalance: number;
      realizedPnl: number;
      totalTrades: number;
    }
  > = new Map();

  private readonly SWAP_PROGRAM_IDS = new Set([
    // Jupiter Aggregator v6
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    // Raydium v4
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    // Orca Whirlpools
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    // Add other DEX program IDs as needed
  ]);

  private constructor() {
    this.connection = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");
  }

  public static getInstance(): WalletMonitorService {
    if (!WalletMonitorService.instance) {
      WalletMonitorService.instance = new WalletMonitorService();
    }
    return WalletMonitorService.instance;
  }

  public async initialize() {
    await this.loadActiveWallets();
    await this.fetchWalletBalances();
    await this.fetchRecentTrades();
    this.startPolling();
    console.log("📡 Started wallet monitoring service");
  }

  private async runMonitoringCycle() {
    await this.loadActiveWallets();
    await this.fetchRecentTrades();
    console.log("📡 Monitoring wallets:", Array.from(this.activeWallets));
  }

  private async loadActiveWallets() {
    const activeUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.isLive, true));

    activeUsers.forEach((user) => {
      this.activeWallets.add(user.walletAddress);
      this.userCache.set(user.walletAddress, user);
    });
  }

  private async fetchWalletBalances(specificWallets?: string[]) {
    const walletsToCheck = specificWallets || Array.from(this.activeWallets);
    for (const walletAddress of walletsToCheck) {
      try {
        const pubkey = new PublicKey(walletAddress);
        const balance = await this.connection.getBalance(pubkey);
        await this.initializeDailyPnL(walletAddress, balance / 1e9);
        const tokens = await this.connection.getParsedTokenAccountsByOwner(
          pubkey,
          {
            programId: TOKEN_PROGRAM_ID,
          }
        );

        console.log(`\n💰 Wallet ${walletAddress} Balance:`);
        console.log(`◎ SOL: ${(balance / 1e9).toFixed(9)}`);
        console.log("🪙 Tokens:");
        tokens.value.forEach(({ account }) => {
          const { mint, tokenAmount } = account.data.parsed.info;
          const amount = tokenAmount?.uiAmount ?? 0;
          if (amount > 0) {
            console.log(
              `- ${mint}: ${amount.toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}`
            );
          }
        });
      } catch (error) {
        console.error(`❌ Error fetching balance for ${walletAddress}:`, error);
      }
    }
  }

  private async fetchRecentTrades() {
    for (const walletAddress of this.activeWallets) {
      try {
        const pubkey = new PublicKey(walletAddress);
        const signatures = await this.connection.getSignaturesForAddress(
          pubkey,
          { limit: 5 }
        );

        // Skip if no new transactions
        const lastSig = this.lastSignatures.get(walletAddress);
        if (signatures.length > 0) {
          if (signatures[0].signature === lastSig) {
            continue; // No new transactions since last check
          }
          this.lastSignatures.set(walletAddress, signatures[0].signature);
        }

        console.log(`\n📜 Recent Trades for ${walletAddress}:`);
        await this.processTransactions(
          signatures.map((sig) => sig.signature),
          walletAddress
        );
      } catch (error) {
        console.error(`❌ Error fetching trades for ${walletAddress}:`, error);
      }
    }
  }

  private async processTransactions(
    signatures: string[],
    walletAddress: string
  ) {
    // Sort signatures by blockTime in ascending order
    const txsWithTime = await Promise.all(
      signatures.map(async (sig) => {
        const tx = await this.connection.getTransaction(sig, {
          maxSupportedTransactionVersion: 0,
        });
        return { signature: sig, blockTime: tx?.blockTime || 0 };
      })
    );

    // Process in chronological order (oldest first)
    const sortedSignatures = txsWithTime
      .sort((a, b) => a.blockTime - b.blockTime)
      .map((tx) => tx.signature);

    for (const signature of sortedSignatures) {
      await this.processTransaction(
        signature,
        walletAddress,
        txsWithTime.find((tx) => tx.signature === signature)?.blockTime
      );
    }
  }

  private async processTransaction(
    signature: string,
    walletAddress: string,
    blockTime?: number
  ) {
    try {
      // Skip if no blockTime or transaction is from before today
      if (!blockTime) return;

      const txDate = this.getPSTDate(new Date(blockTime * 1000));
      const todayStart = this.getPSTStartOfDay();
      const todayEnd = this.getPSTEndOfDay();

      if (txDate < todayStart || txDate > todayEnd) {
        console.log(
          "Skipping transaction from:",
          txDate.toISOString(),
          "- Not from today"
        );
        return;
      }

      console.log("\n🔍 Processing Transaction:", {
        signature,
        timestamp: new Date(blockTime * 1000).toISOString(),
      });

      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });

      if (!tx?.meta) return;

      // Find wallet's account index and SOL changes
      const walletAccountIndex = tx.transaction.message.accountKeys.findIndex(
        (account) => account.pubkey.toString() === walletAddress
      );

      if (walletAccountIndex === -1) return;

      // Calculate SOL changes including transaction fees
      const preSol = tx.meta.preBalances[walletAccountIndex] / 1e9;
      const postSol = tx.meta.postBalances[walletAccountIndex] / 1e9;
      const solChange = postSol - preSol;

      // Calculate total SOL change including inner instructions
      let totalSolChange = solChange;
      if (tx.meta.innerInstructions) {
        for (const inner of tx.meta.innerInstructions) {
          for (const ix of inner.instructions) {
            if (
              "parsed" in ix &&
              ix.parsed.type === "transfer" &&
              ix.parsed.info.destination === walletAddress
            ) {
              totalSolChange -= Number(ix.parsed.info.lamports) / 1e9;
            }
            if (
              "parsed" in ix &&
              ix.parsed.type === "transfer" &&
              ix.parsed.info.source === walletAddress
            ) {
              totalSolChange += Number(ix.parsed.info.lamports) / 1e9;
            }
          }
        }
      }

      // Get all program IDs involved in this transaction
      const programIds = tx.transaction.message.accountKeys
        .filter((key) => key.signer === false && key.writable === false)
        .map((key) => key.pubkey.toString());

      // Check if this is a trade/swap transaction
      const isSwap = programIds.some((id) => this.SWAP_PROGRAM_IDS.has(id));

      // Skip if not a swap and not involving token program
      if (!isSwap && !programIds.includes(TOKEN_PROGRAM_ID.toString())) {
        return;
      }

      // Skip if it's just a token account creation
      if (
        programIds.includes(ASSOCIATED_TOKEN_PROGRAM_ID.toString()) &&
        programIds.length === 1
      ) {
        return;
      }

      const {
        preBalances = [],
        postBalances = [],
        preTokenBalances = [],
        postTokenBalances = [],
      } = tx.meta;

      // Skip if no token balance changes
      if (preTokenBalances?.length === 0 && postTokenBalances?.length === 0) {
        return;
      }

      const user = this.userCache.get(walletAddress);
      if (!user) {
        console.error(`No user found for wallet ${walletAddress}`);
        return;
      }

      const solColor = totalSolChange >= 0 ? "\x1b[32m" : "\x1b[31m";
      const changeSymbol = totalSolChange >= 0 ? "📈" : "📉";
      const sign = totalSolChange >= 0 ? "+" : "-";
      console.log(
        `${solColor}SOL ${changeSymbol} ${sign}${Math.abs(
          totalSolChange
        ).toFixed(9)}`
      );
      console.log(`Balance: ${postSol.toFixed(9)}${"\x1b[0m"}`);

      console.log("Debug transaction details:", {
        signature,
        preSol,
        postSol,
        basicSolChange: solChange,
        totalSolChange,
        hasInnerInstructions: !!tx.meta.innerInstructions?.length,
        programIds: tx.transaction.message.accountKeys
          .filter((key) => key.signer === false && key.writable === false)
          .map((key) => key.pubkey.toString()),
      });

      // Only look at token changes for our specific wallet
      postTokenBalances?.forEach(async (post) => {
        if (post.owner === walletAddress) {
          const pre = preTokenBalances?.find(
            (p) => p.accountIndex === post.accountIndex
          );
          const preAmount = pre?.uiTokenAmount?.uiAmount ?? 0;
          const postAmount = post.uiTokenAmount?.uiAmount ?? 0;
          const change = postAmount - preAmount;

          // Skip wrapped SOL and zero changes
          if (
            post.mint === "So11111111111111111111111111111111111111112" ||
            change === 0
          )
            return;

          const isBuy = change > 0;
          const changeSymbol = isBuy ? "📈" : "📉";
          const color = isBuy ? "\x1b[32m" : "\x1b[31m";
          const resetColor = "\x1b[0m";

          console.log(`${color}${isBuy ? "BUY" : "SELL"} ${post.mint}`);
          console.log(
            `Amount: ${changeSymbol} ${Math.abs(change).toLocaleString(
              undefined,
              { maximumFractionDigits: 9 }
            )}`
          );
          console.log(
            `Final Balance: ${postAmount.toLocaleString(undefined, {
              maximumFractionDigits: 9,
            })}${resetColor}`
          );

          // Save trade to database
          const tradeData = {
            userId: user.id,
            signature,
            walletAddress,
            tokenA: post.mint,
            tokenB: "So11111111111111111111111111111111111111112",
            type: isBuy ? "buy" : "sell",
            amountA: Math.abs(change).toString(),
            amountB: Math.abs(totalSolChange).toString(),
            priceUsd: "0",
            platform: "unknown",
            txFees: "0",
            timestamp: new Date(blockTime! * 1000),
            rawData: tx,
            tradePnl: isBuy
              ? (-Math.abs(totalSolChange)).toString() // When buying, lose SOL
              : Math.abs(totalSolChange).toString(), // When selling, gain SOL
          } as const;

          await db
            .insert(tradesTable)
            .values(tradeData)
            .onConflictDoUpdate({
              target: [tradesTable.signature],
              set: tradeData,
            });

          // After processing a trade, update the daily PnL
          const tradePnl = parseFloat(tradeData.tradePnl);
          await this.updateDailyPnL(walletAddress, postSol, tradePnl);
        }
      });
    } catch (error) {
      console.error(`❌ Error processing transaction ${signature}:`, error);
    }
  }

  private startPolling() {
    this.pollingInterval = setInterval(async () => {
      await this.runMonitoringCycle();
    }, 3000) as unknown as NodeJS.Timeout;

    // Clean up on process exit
    process.on("SIGINT", () => {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
      }
      process.exit();
    });
  }

  public async addWallet(
    walletAddress: string,
    userData: typeof usersTable.$inferSelect
  ) {
    this.activeWallets.add(walletAddress);
    this.userCache.set(walletAddress, userData);
    await this.fetchWalletBalances([walletAddress]);
    console.log(`➕ Added wallet to monitor: ${walletAddress}`);
  }

  public removeWallet(walletAddress: string) {
    this.activeWallets.delete(walletAddress);
    this.userCache.delete(walletAddress);
    console.log(`➖ Removed wallet from monitor: ${walletAddress}`);
  }

  private getPSTDate(date: Date = new Date()): Date {
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    return new Date(utc + 3600000 * this.PST_OFFSET);
  }

  private getPSTStartOfDay(date: Date = new Date()): Date {
    const pst = this.getPSTDate(date);
    pst.setHours(0, 0, 0, 0);
    return pst;
  }

  private getPSTEndOfDay(date: Date = new Date()): Date {
    const pst = this.getPSTDate(date);
    pst.setHours(23, 59, 59, 999);
    return pst;
  }

  private async initializeDailyPnL(
    walletAddress: string,
    initialBalance: number
  ) {
    const pstDate = this.getPSTStartOfDay();

    // Check if we already have a record for today
    const existingRecord = await db
      .select()
      .from(pnlRecordsTable)
      .where(
        and(
          eq(pnlRecordsTable.walletAddress, walletAddress),
          eq(pnlRecordsTable.date, pstDate)
        )
      )
      .limit(1);

    if (existingRecord.length === 0) {
      // Create new PnL record for the day
      this.dailyPnLCache.set(walletAddress, {
        date: pstDate,
        startBalance: initialBalance,
        currentBalance: initialBalance,
        realizedPnl: 0,
        totalTrades: 0,
      });

      // Insert initial record into database
      await db.insert(pnlRecordsTable).values({
        userId: this.userCache.get(walletAddress)?.id,
        walletAddress,
        date: pstDate,
        startBalance: initialBalance.toString(),
        realizedPnl: "0",
        totalTrades: 0,
      });
    } else {
      // Load existing record into cache
      const record = existingRecord[0];
      this.dailyPnLCache.set(walletAddress, {
        date: record.date,
        startBalance: parseFloat(record.startBalance.toString()),
        currentBalance: parseFloat(
          record.endBalance?.toString() || record.startBalance.toString()
        ),
        realizedPnl: parseFloat(record.realizedPnl.toString()),
        totalTrades: record.totalTrades,
      });
    }
  }

  private async updateDailyPnL(
    walletAddress: string,
    currentBalance: number,
    tradePnl: number
  ) {
    const cache = this.dailyPnLCache.get(walletAddress);
    if (!cache) return;

    // Update cache
    cache.currentBalance = currentBalance;
    cache.realizedPnl += tradePnl;
    cache.totalTrades += 1;

    // Update database
    await db
      .update(pnlRecordsTable)
      .set({
        endBalance: currentBalance.toString(),
        realizedPnl: cache.realizedPnl.toString(),
        totalTrades: cache.totalTrades,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pnlRecordsTable.walletAddress, walletAddress),
          eq(pnlRecordsTable.date, cache.date)
        )
      );
  }
}
