import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { db } from "../../db";
import { tradesTable, usersTable, pnlRecordsTable } from "../../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { EventEmitter } from "events";

export class WalletMonitorService extends EventEmitter {
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
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
    "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP", // Orca v2
    "SwaPpA9LAaLfeLi3a68M4DjnLqgtticKg6CnyNwgAC8", // Raydium v3
    "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C", // Raydium v4
    "6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma", // OKX DEX
    "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", // pumpfun
  ]);

  private constructor() {
    super(); // Initialize EventEmitter
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

        const tokenBalances: { mint: string; amount: number }[] = [];

        tokens.value.forEach(({ account }) => {
          const { mint, tokenAmount } = account.data.parsed.info;
          const amount = tokenAmount?.uiAmount ?? 0;
          if (amount > 0) {
            console.log(
              `- ${mint}: ${amount.toLocaleString(undefined, {
                maximumFractionDigits: 6,
              })}`
            );
            tokenBalances.push({ mint, amount });
          }
        });

        // Emit balance update event
        this.emit("balance", walletAddress, {
          solBalance: balance / 1e9,
          tokens: tokenBalances,
          timestamp: new Date(),
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
          { limit: 20 }
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
      // Add check for existing trade at the start
      const existingTrade = await db
        .select()
        .from(tradesTable)
        .where(eq(tradesTable.signature, signature))
        .limit(1);

      if (existingTrade.length > 0) {
        console.log(`Skipping existing trade: ${signature}`);
        return;
      }

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

      // Initialize daily PnL record before processing transaction
      const preSol = tx.meta.preBalances[walletAccountIndex] / 1e9;
      await this.initializeDailyPnL(walletAddress, preSol);

      // Calculate SOL changes including transaction fees
      const postSol = tx.meta.postBalances[walletAccountIndex] / 1e9;
      const solChange = postSol - preSol;

      // Get all program IDs involved in this transaction
      const programIds = tx.transaction.message.accountKeys
        .filter((key) => key.signer === false && key.writable === false)
        .map((key) => key.pubkey.toString());

      // Improved swap detection logic
      const isSwap =
        programIds.some((id) => this.SWAP_PROGRAM_IDS.has(id)) ||
        (tx.meta?.innerInstructions?.some((inner) =>
          inner.instructions.some((ix) => {
            if ("programId" in ix) {
              return this.SWAP_PROGRAM_IDS.has(ix.programId.toString());
            }
            return false;
          })
        ) ??
          false);

      // A transfer is when it's NOT a swap and involves the token program
      const isTransfer =
        !isSwap &&
        programIds.includes(TOKEN_PROGRAM_ID.toString()) &&
        !programIds.some((id) => this.SWAP_PROGRAM_IDS.has(id));

      console.log("Transaction type:", {
        signature,
        isSwap,
        isTransfer,
        programIds,
        hasInnerInstructions: !!tx.meta?.innerInstructions?.length,
      });

      if (isTransfer) {
        // Handle transfers
        const {
          preBalances = [],
          postBalances = [],
          preTokenBalances = [],
          postTokenBalances = [],
        } = tx.meta;

        postTokenBalances?.forEach(async (post) => {
          if (post.owner === walletAddress) {
            const pre = preTokenBalances?.find(
              (p) => p.accountIndex === post.accountIndex
            );
            const preAmount = pre?.uiTokenAmount?.uiAmount ?? 0;
            const postAmount = post.uiTokenAmount?.uiAmount ?? 0;
            const change = postAmount - preAmount;

            if (change === 0) return;

            const isDeposit = change > 0;
            const changeSymbol = isDeposit ? "📈" : "📉";
            const color = isDeposit ? "\x1b[32m" : "\x1b[31m";

            console.log(
              `${color}TOKEN ${isDeposit ? "DEPOSIT" : "WITHDRAWAL"}: ${
                post.mint
              }`
            );
            console.log(
              `Amount: ${changeSymbol} ${Math.abs(change).toLocaleString(
                undefined,
                { maximumFractionDigits: 9 }
              )}`
            );
            console.log(`Final Balance: ${postAmount}${"\x1b[0m"}`);

            // Save transfer to database
            const transferData = {
              userId: this.userCache.get(walletAddress)?.id,
              signature,
              walletAddress,
              tokenA: post.mint,
              tokenB: post.mint,
              type: isDeposit ? "deposit" : "withdrawal",
              amountA: Math.abs(change).toString(),
              amountB: Math.abs(change).toString(),
              priceUsd: "0",
              platform: "transfer",
              txFees: "0",
              timestamp: new Date(blockTime! * 1000),
              rawData: tx,
              tradePnl: "0", // Transfers don't affect PnL
            } as const;

            const result = await db
              .insert(tradesTable)
              .values(transferData)
              .onConflictDoUpdate({
                target: [tradesTable.signature],
                set: transferData,
              });

            // Emit trade update event
            this.emit("trade", walletAddress, {
              ...transferData,
              id:
                Array.isArray(result) && result.length > 0
                  ? result[0]?.insertId
                  : undefined,
              timestamp: new Date(blockTime! * 1000),
            });

            // Important: Don't call updateDailyPnL for transfers at all
            // Remove or comment out this block:
            /*
            if (post.mint === "So11111111111111111111111111111111111111112") {
              await this.updateDailyPnL(walletAddress, postAmount, 0);
            }
            */
          }
        });
      } else if (isSwap) {
        // Process token changes for swaps
        const {
          preBalances = [],
          postBalances = [],
          preTokenBalances = [],
          postTokenBalances = [],
        } = tx.meta;

        postTokenBalances?.forEach(async (post) => {
          if (post.owner === walletAddress) {
            const pre = preTokenBalances?.find(
              (p) => p.accountIndex === post.accountIndex
            );
            const preAmount = pre?.uiTokenAmount?.uiAmount ?? 0;
            const postAmount = post.uiTokenAmount?.uiAmount ?? 0;
            const change = postAmount - preAmount;

            // Skip if no change or wrapped SOL
            if (
              change === 0 ||
              post.mint === "So11111111111111111111111111111111111111112"
            ) {
              return;
            }

            const isBuy = change > 0;
            const tradePnl = isBuy ? -Math.abs(solChange) : Math.abs(solChange);

            const tradeData = {
              userId: this.userCache.get(walletAddress)?.id,
              signature,
              walletAddress,
              tokenA: post.mint,
              tokenB: "So11111111111111111111111111111111111111112",
              type: isBuy ? "buy" : "sell",
              amountA: Math.abs(change).toString(),
              amountB: Math.abs(solChange).toString(),
              priceUsd: "0",
              platform:
                programIds.find((id) => this.SWAP_PROGRAM_IDS.has(id)) ||
                "unknown",
              txFees: "0",
              timestamp: new Date(blockTime! * 1000),
              rawData: tx,
              tradePnl: tradePnl.toString(),
            } as const;

            const result = await db
              .insert(tradesTable)
              .values(tradeData)
              .onConflictDoUpdate({
                target: [tradesTable.signature],
                set: tradeData,
              });

            // Emit trade update event
            this.emit("trade", walletAddress, {
              ...tradeData,
              id:
                Array.isArray(result) && result.length > 0
                  ? result[0]?.insertId
                  : undefined,
              timestamp: new Date(blockTime! * 1000),
            });

            // Only update PnL if this is a new trade
            await this.updateDailyPnL(walletAddress, postSol, tradePnl);
          }
        });
      }
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
    currentBalance: number
  ) {
    const today = this.getPSTStartOfDay();

    // Check if we already have a PnL record for today
    const existingRecord = await db
      .select()
      .from(pnlRecordsTable)
      .where(
        and(
          eq(pnlRecordsTable.walletAddress, walletAddress),
          eq(pnlRecordsTable.date, today)
        )
      )
      .limit(1);

    if (existingRecord.length === 0) {
      // Get the last PnL record to carry over the balance
      const lastRecord = await db
        .select()
        .from(pnlRecordsTable)
        .where(eq(pnlRecordsTable.walletAddress, walletAddress))
        .orderBy(desc(pnlRecordsTable.date))
        .limit(1);

      const startBalance =
        lastRecord.length > 0 && lastRecord[0].endBalance
          ? parseFloat(lastRecord[0].endBalance)
          : currentBalance;

      // Create new PnL record for today
      await db.insert(pnlRecordsTable).values({
        walletAddress,
        date: today,
        startBalance: startBalance.toString(),
        endBalance: currentBalance.toString(),
        realizedPnl: "0",
        totalTrades: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Update cache
      this.dailyPnLCache.set(walletAddress, {
        date: today,
        startBalance,
        currentBalance,
        realizedPnl: 0,
        totalTrades: 0,
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

    // Only increment totalTrades for actual trades (not transfers)
    if (tradePnl !== 0) {
      cache.totalTrades += 1;
    }

    // Update cache
    cache.currentBalance = currentBalance;
    cache.realizedPnl += tradePnl;

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

    // Emit PnL update event
    this.emit("pnl", walletAddress, {
      date: cache.date,
      startBalance: cache.startBalance,
      currentBalance: cache.currentBalance,
      realizedPnl: cache.realizedPnl,
      totalTrades: cache.totalTrades,
      timestamp: new Date(),
    });
  }
}
