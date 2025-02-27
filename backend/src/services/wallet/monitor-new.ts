import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { db } from "../../db";
import { tradesTable, usersTable, pnlRecordsTable } from "../../db/schema";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { EventEmitter } from "events";
import { TokenMetadataService } from "../token/metadata";

/**
 * WalletMonitorServiceNew
 *
 * A service to monitor Solana wallets for trades, track PnL, and update user balances.
 * This service focuses on classifying trades based on SOL and token balance changes,
 * rather than relying on program IDs.
 */
export class WalletMonitorServiceNew extends EventEmitter {
  private connection: Connection;
  private activeWallets: Map<
    string,
    { userId: number | null; lastSignature?: string }
  > = new Map();
  private static instance: WalletMonitorServiceNew;
  private pollingInterval: NodeJS.Timeout | null = null;
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
  private tokenMetadataService: TokenMetadataService;
  private processedTransactions: Set<string> = new Set(); // Add this to the class properties

  private constructor() {
    super(); // Initialize EventEmitter
    this.connection = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");
    this.tokenMetadataService = TokenMetadataService.getInstance();
  }

  public static getInstance(): WalletMonitorServiceNew {
    if (!WalletMonitorServiceNew.instance) {
      WalletMonitorServiceNew.instance = new WalletMonitorServiceNew();
    }
    return WalletMonitorServiceNew.instance;
  }

  /**
   * Initialize the wallet monitoring service
   */
  public async initialize() {
    // Initialize token metadata service
    await this.tokenMetadataService.initialize();

    await this.loadActiveWallets();
    await this.fetchWalletBalances();
    this.startPolling();
    console.log("📡 Started new wallet monitoring service");
  }

  /**
   * Load active wallets from the database
   */
  private async loadActiveWallets() {
    console.log("Loading active wallets...");
    const activeUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.isLive, true));

    // Track new wallets that were added in this update
    const newWallets: string[] = [];

    // Store current wallet addresses to determine which ones need to be removed
    const currentWalletAddresses = new Set(
      activeUsers.map((user) => user.walletAddress)
    );

    // Find wallets to remove (wallets that are no longer active)
    const walletsToRemove: string[] = [];
    for (const walletAddress of this.activeWallets.keys()) {
      if (!currentWalletAddresses.has(walletAddress)) {
        walletsToRemove.push(walletAddress);
      }
    }

    // Remove wallets that are no longer active
    for (const walletAddress of walletsToRemove) {
      this.activeWallets.delete(walletAddress);
      console.log(`Removed wallet from monitoring: ${walletAddress}`);
    }

    activeUsers.forEach((user) => {
      // Check if this is a new wallet that wasn't previously monitored
      if (!this.activeWallets.has(user.walletAddress)) {
        newWallets.push(user.walletAddress);
      }

      this.activeWallets.set(user.walletAddress, { userId: user.id });
      console.log(`Added wallet to monitor: ${user.walletAddress}`);
    });

    console.log(`Loaded ${this.activeWallets.size} active wallets`);

    // If there are new wallets, load their recent transactions
    if (newWallets.length > 0) {
      console.log(
        `Loading recent transactions for ${newWallets.length} new wallets`
      );
      await this.loadRecentTransactionsForWallets(newWallets);
    }
  }

  /**
   * Load recent transactions for specific wallets
   */
  private async loadRecentTransactionsForWallets(walletAddresses: string[]) {
    try {
      if (walletAddresses.length === 0) {
        return;
      }

      console.log(
        `Loading recent transactions for wallets: ${walletAddresses.join(", ")}`
      );

      for (const walletAddress of walletAddresses) {
        // Get the last 20 transactions for each wallet (increased from 15)
        const transactions = await db
          .select({
            signature: tradesTable.signature,
            timestamp: tradesTable.timestamp,
          })
          .from(tradesTable)
          .where(eq(tradesTable.walletAddress, walletAddress))
          .orderBy(desc(tradesTable.timestamp))
          .limit(20);

        // Add each transaction signature to the processed set
        transactions.forEach((transaction) => {
          this.processedTransactions.add(transaction.signature);
        });

        // Update the wallet's last signature if we have transactions
        if (transactions.length > 0) {
          this.activeWallets.set(walletAddress, {
            ...this.activeWallets.get(walletAddress)!,
            lastSignature: transactions[0].signature,
          });
        }

        console.log(
          `Loaded and cached ${transactions.length} recent transactions for wallet ${walletAddress}`
        );
      }
    } catch (error) {
      console.error("❌ Error loading recent transactions for wallets:", error);
    }
  }

  /**
   * Fetch SOL and token balances for all wallets or specific wallets
   */
  private async fetchWalletBalances(specificWallets?: string[]) {
    const walletsToCheck =
      specificWallets || Array.from(this.activeWallets.keys());
    for (const walletAddress of walletsToCheck) {
      try {
        const pubkey = new PublicKey(walletAddress);
        const balance = await this.connection.getBalance(pubkey);
        const solBalance = balance / 1e9;

        // Initialize daily PnL with current balance
        await this.initializeDailyPnL(walletAddress, solBalance);

        // Update user balance in database
        await this.updateUserBalance(walletAddress, solBalance);

        console.log(
          `\n💰 Wallet ${walletAddress} Balance: ◎ ${solBalance.toFixed(9)}`
        );

        // Get token accounts
        const tokens = await this.connection.getParsedTokenAccountsByOwner(
          pubkey,
          { programId: TOKEN_PROGRAM_ID }
        );

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

        // Emit balance update event
        this.emit("balance", walletAddress, {
          solBalance: solBalance,
          tokens: tokens.value.map(({ account }) => ({
            mint: account.data.parsed.info.mint,
            amount: account.data.parsed.info.tokenAmount?.uiAmount ?? 0,
          })),
          timestamp: new Date(),
        });
      } catch (error) {
        console.error(`❌ Error fetching balance for ${walletAddress}:`, error);
      }
    }
  }

  /**
   * Update user's SOL balance in the database
   */
  private async updateUserBalance(walletAddress: string, solBalance: number) {
    const walletInfo = this.activeWallets.get(walletAddress);
    if (!walletInfo?.userId) return;

    try {
      await db
        .update(usersTable)
        .set({
          lastActive: new Date(),
          // Here we could add a solBalance field to the users table if needed
        })
        .where(eq(usersTable.id, walletInfo.userId));
    } catch (error) {
      console.error(
        `❌ Error updating user balance for ${walletAddress}:`,
        error
      );
    }
  }

  /**
   * Fetch recent transactions for all active wallets
   */
  private async fetchRecentTransactions() {
    for (const [walletAddress, walletInfo] of this.activeWallets.entries()) {
      try {
        const pubkey = new PublicKey(walletAddress);
        const signatures = await this.connection.getSignaturesForAddress(
          pubkey,
          { limit: 15 }
        );

        // Skip if no new transactions
        if (signatures.length === 0) continue;

        // Skip if last signature matches first signature (no new transactions)
        if (
          walletInfo.lastSignature &&
          signatures[0].signature === walletInfo.lastSignature
        ) {
          console.log(
            `No new transactions for ${walletAddress} since ${walletInfo.lastSignature}`
          );
          continue;
        }

        // Update last signature
        this.activeWallets.set(walletAddress, {
          ...walletInfo,
          lastSignature: signatures[0].signature,
        });

        console.log(`\n📜 Processing recent transactions for ${walletAddress}`);
        await this.processTransactions(
          signatures.map((sig) => sig.signature),
          walletAddress
        );
      } catch (error) {
        console.error(
          `❌ Error fetching transactions for ${walletAddress}:`,
          error
        );
      }
    }
  }

  /**
   * Process a batch of transactions for a wallet
   */
  private async processTransactions(
    signatures: string[],
    walletAddress: string
  ) {
    // Sort signatures by blockTime in ascending order (oldest first)
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

  /**
   * Process a single transaction
   */
  private async processTransaction(
    signature: string,
    walletAddress: string,
    blockTime?: number
  ) {
    try {
      // First check our in-memory processed transactions set
      if (this.processedTransactions.has(signature)) {
        console.log(`Skipping already processed transaction: ${signature}`);
        return;
      }

      // Then check the database (as a backup)
      const existingTrade = await db
        .select()
        .from(tradesTable)
        .where(eq(tradesTable.signature, signature))
        .limit(1);

      if (existingTrade.length > 0) {
        console.log(`Skipping existing trade: ${signature}`);
        this.processedTransactions.add(signature); // Add to our set
        return;
      }

      // Skip if no blockTime
      if (!blockTime) {
        this.processedTransactions.add(signature); // Cache signatures without blockTime
        return;
      }

      const txDate = this.getPSTDate(new Date(blockTime * 1000));
      const todayStart = this.getPSTStartOfDay();
      const todayEnd = this.getPSTEndOfDay();

      // Cache and skip if transaction is not from today
      if (txDate < todayStart || txDate > todayEnd) {
        console.log(
          "Skipping transaction from:",
          txDate.toISOString(),
          "- Not from today"
        );
        this.processedTransactions.add(signature);
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

      if (!tx?.meta) {
        console.log(`No transaction metadata for ${signature}`);
        this.processedTransactions.add(signature); // Cache signatures without metadata
        return;
      }

      // Find wallet's account index and SOL changes
      const walletAccountIndex = tx.transaction.message.accountKeys.findIndex(
        (account) => account.pubkey.toString() === walletAddress
      );

      if (walletAccountIndex === -1) {
        console.log(`Wallet not found in transaction accounts: ${signature}`);
        this.processedTransactions.add(signature); // Cache signatures where wallet is not found
        return;
      }

      // Get SOL balance changes
      const preSol = tx.meta.preBalances[walletAccountIndex] / 1e9;
      const postSol = tx.meta.postBalances[walletAccountIndex] / 1e9;
      const solChange = postSol - preSol;

      // Cache and skip if SOL change is negligible (likely just a fee)
      if (Math.abs(solChange) < 0.000001) {
        console.log(
          `Skipping transaction with negligible SOL change: ${signature}`
        );
        this.processedTransactions.add(signature);
        return;
      }

      // Get token balance changes
      const { preTokenBalances = [], postTokenBalances = [] } = tx.meta;

      // Track all token changes for this wallet
      const tokenChanges: Array<{
        mint: string;
        preAmount: number;
        postAmount: number;
        change: number;
      }> = [];

      // Process all tokens in post balances
      if (postTokenBalances) {
        postTokenBalances.forEach((post) => {
          if (post.owner === walletAddress) {
            const pre = preTokenBalances?.find(
              (p) => p.accountIndex === post.accountIndex
            );
            const preAmount = pre?.uiTokenAmount?.uiAmount ?? 0;
            const postAmount = post.uiTokenAmount?.uiAmount ?? 0;
            const change = postAmount - preAmount;

            if (Math.abs(change) > 0.000001) {
              tokenChanges.push({
                mint: post.mint,
                preAmount,
                postAmount,
                change,
              });
            }
          }
        });
      }

      // Look for tokens that existed in pre but not in post (fully sold/transferred)
      if (preTokenBalances) {
        preTokenBalances.forEach((pre) => {
          const alreadyProcessed = tokenChanges.some(
            (tc) =>
              postTokenBalances?.some(
                (post) =>
                  post.accountIndex === pre.accountIndex &&
                  post.mint === tc.mint
              ) ?? false
          );

          if (!alreadyProcessed && pre.owner === walletAddress) {
            const preAmount = pre.uiTokenAmount?.uiAmount ?? 0;
            if (preAmount > 0) {
              tokenChanges.push({
                mint: pre.mint,
                preAmount,
                postAmount: 0,
                change: -preAmount,
              });
            }
          }
        });
      }

      // Skip if no token changes
      if (tokenChanges.length === 0) {
        console.log(
          `No token balance changes for wallet in transaction: ${signature}`
        );
        return;
      }

      console.log("💱 SOL Change:", solChange.toFixed(9));
      console.log("Token Changes:", tokenChanges);

      // Classify transaction and save to database
      await this.classifyAndSaveTransaction(
        signature,
        walletAddress,
        solChange,
        tokenChanges,
        tx,
        blockTime
      );

      // Update wallet balance
      await this.updateUserBalance(walletAddress, postSol);

      // Add this at the end of successful processing
      this.processedTransactions.add(signature);
    } catch (error) {
      console.error(`❌ Error processing transaction ${signature}:`, error);
      this.processedTransactions.add(signature); // Cache even failed transactions
    }
  }

  /**
   * Classify transaction as buy/sell/transfer and save to database
   */
  private async classifyAndSaveTransaction(
    signature: string,
    walletAddress: string,
    solChange: number,
    tokenChanges: Array<{
      mint: string;
      preAmount: number;
      postAmount: number;
      change: number;
    }>,
    tx: any,
    blockTime: number
  ) {
    // Check if transaction was successful before proceeding
    if (tx.meta.err) {
      console.log(`Skipping failed transaction save: ${signature}`);
      return;
    }

    // For each token with significant change, determine if it's a trade
    for (const tokenChange of tokenChanges) {
      // Skip wrapped SOL as it's just a representation of SOL
      if (tokenChange.mint === "So11111111111111111111111111111111111111112") {
        continue;
      }

      const { mint, change } = tokenChange;

      // Check if this is a trade (SOL and token changes are in opposite directions)
      const isBuy = change > 0 && solChange < 0;
      const isSell = change < 0 && solChange > 0;

      if (isBuy || isSell) {
        // This is a trade
        const tradePnl = isBuy ? -Math.abs(solChange) : Math.abs(solChange);

        console.log(`✅ ${isBuy ? "BUY" : "SELL"} Trade detected:`, {
          token: mint,
          tokenChange: change,
          solChange,
          tradePnl,
        });

        const tradeData = {
          userId: this.activeWallets.get(walletAddress)?.userId,
          signature,
          walletAddress,
          tokenA: mint,
          tokenB: "So11111111111111111111111111111111111111112", // SOL
          type: isBuy ? "buy" : "sell",
          amountA: Math.abs(change).toString(),
          amountB: Math.abs(solChange).toString(),
          priceUsd: "0", // We could add price fetching later
          platform: "unknown", // We're not using platform detection in this approach
          txFees: "0", // Transaction fees could be calculated
          timestamp: new Date(blockTime * 1000),
          rawData: tx,
          tradePnl: tradePnl.toString(),
        };

        // Save trade to database
        const result = await db
          .insert(tradesTable)
          .values(tradeData)
          .onConflictDoUpdate({
            target: [tradesTable.signature],
            set: tradeData,
          });

        console.log(`Trade saved to database: ${signature}`);

        // Emit trade update event
        this.emit("trade", walletAddress, {
          ...tradeData,
          id: (result as any).insertId || 0, // Handle ID safely with type casting
          timestamp: new Date(blockTime * 1000),
        });

        // Get the post-transaction SOL balance
        const walletAccountIndex = tx.transaction.message.accountKeys.findIndex(
          (account: { pubkey: { toString: () => string } }) =>
            account.pubkey.toString() === walletAddress
        );
        const postSol = tx.meta.postBalances[walletAccountIndex] / 1e9;

        // Update daily PnL for trades
        await this.updateDailyPnL(walletAddress, postSol, tradePnl);
      } else {
        // This is a transfer (token change without corresponding SOL change)
        const isDeposit = change > 0;

        console.log(
          `📥 Token ${isDeposit ? "DEPOSIT" : "WITHDRAWAL"} detected:`,
          {
            token: mint,
            change: Math.abs(change),
          }
        );

        const transferData = {
          userId: this.activeWallets.get(walletAddress)?.userId,
          signature,
          walletAddress,
          tokenA: mint,
          tokenB: mint,
          type: isDeposit ? "deposit" : "withdrawal",
          amountA: Math.abs(change).toString(),
          amountB: Math.abs(change).toString(),
          priceUsd: "0",
          platform: "transfer",
          txFees: "0",
          timestamp: new Date(blockTime * 1000),
          rawData: tx,
          tradePnl: "0", // Transfers don't affect PnL
        };

        // Save transfer to database
        const result = await db
          .insert(tradesTable)
          .values(transferData)
          .onConflictDoUpdate({
            target: [tradesTable.signature],
            set: transferData,
          });

        console.log(`Transfer saved to database: ${signature}`);
      }
    }
  }

  /**
   * Start polling for new transactions
   */
  private startPolling() {
    this.pollingInterval = setInterval(async () => {
      console.log("\n🔄 Running monitoring cycle...");
      try {
        // First check for any new wallets or wallets that are no longer active
        await this.loadActiveWallets();
        await this.fetchRecentTransactions();
      } catch (error) {
        console.error("❌ Error in monitoring cycle:", error);
      }
    }, 5000) as unknown as NodeJS.Timeout;

    // Clean up on process exit
    process.on("SIGINT", () => {
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
      }
      console.log("👋 Stopping wallet monitoring service");
      process.exit();
    });
  }

  /**
   * Initialize daily PnL record for a wallet
   */
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
        userId: this.activeWallets.get(walletAddress)?.userId,
        date: today,
        startBalance: startBalance.toString(),
        endBalance: currentBalance.toString(),
        realizedPnl: "0",
        totalTrades: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`Created new daily PnL record for ${walletAddress}`);

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

  /**
   * Update daily PnL record for a wallet
   */
  private async updateDailyPnL(
    walletAddress: string,
    currentBalance: number,
    tradePnl: number,
    lastTradeId?: number
  ) {
    const cache = this.dailyPnLCache.get(walletAddress);
    if (!cache) {
      console.log(`No daily PnL cache for ${walletAddress}, initializing...`);
      await this.initializeDailyPnL(walletAddress, currentBalance);
      return;
    }

    // Only increment totalTrades for actual trades (not transfers)
    if (tradePnl !== 0) {
      cache.totalTrades += 1;
    }

    // Update cache
    cache.currentBalance = currentBalance;
    cache.realizedPnl += tradePnl;

    // Prepare update data
    const updateData: any = {
      endBalance: currentBalance.toString(),
      realizedPnl: cache.realizedPnl.toString(),
      totalTrades: cache.totalTrades,
      updatedAt: new Date(),
    };

    // Add lastTradeId if available
    if (lastTradeId) {
      updateData.lastTradeId = lastTradeId;
    }

    // Update database
    await db
      .update(pnlRecordsTable)
      .set(updateData)
      .where(
        and(
          eq(pnlRecordsTable.walletAddress, walletAddress),
          eq(pnlRecordsTable.date, cache.date)
        )
      );

    console.log(`Updated daily PnL for ${walletAddress}:`, {
      realizedPnl: cache.realizedPnl,
      totalTrades: cache.totalTrades,
      lastTradeId: lastTradeId || "none",
    });

    // Emit PnL update event
    this.emit("pnl", walletAddress, {
      date: cache.date,
      startBalance: cache.startBalance,
      currentBalance: cache.currentBalance,
      realizedPnl: cache.realizedPnl,
      totalTrades: cache.totalTrades,
      lastTradeId: lastTradeId,
      timestamp: new Date(),
    });
  }

  /**
   * Get date in PST timezone
   */
  private getPSTDate(date: Date = new Date()): Date {
    const utc = date.getTime() + date.getTimezoneOffset() * 60000;
    return new Date(utc + 3600000 * this.PST_OFFSET);
  }

  /**
   * Get start of day in PST timezone
   */
  private getPSTStartOfDay(date: Date = new Date()): Date {
    const pst = this.getPSTDate(date);
    pst.setHours(0, 0, 0, 0);
    return pst;
  }

  /**
   * Get end of day in PST timezone
   */
  private getPSTEndOfDay(date: Date = new Date()): Date {
    const pst = this.getPSTDate(date);
    pst.setHours(23, 59, 59, 999);
    return pst;
  }
}
