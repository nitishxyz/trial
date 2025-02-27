import { Connection, PublicKey } from "@solana/web3.js";
import { db } from "../../db";
import { tokensTable } from "../../db/schema";
import { eq } from "drizzle-orm";

/**
 * Service for managing token metadata
 */
export class TokenMetadataService {
  private static instance: TokenMetadataService;
  private connection: Connection;
  private tokenCache: Map<string, typeof tokensTable.$inferSelect> = new Map();

  private constructor() {
    this.connection = new Connection(process.env.SOLANA_RPC_URL!, "confirmed");
  }

  public static getInstance(): TokenMetadataService {
    if (!TokenMetadataService.instance) {
      TokenMetadataService.instance = new TokenMetadataService();
    }
    return TokenMetadataService.instance;
  }

  /**
   * Initialize token metadata service
   */
  public async initialize() {
    await this.loadTokensFromDatabase();
    console.log(`Loaded ${this.tokenCache.size} tokens from database`);
  }

  /**
   * Load all tokens from database into cache
   */
  private async loadTokensFromDatabase() {
    const tokens = await db.select().from(tokensTable);

    this.tokenCache.clear();
    tokens.forEach((token) => {
      this.tokenCache.set(token.address, token);
    });
  }

  /**
   * Get token metadata by address
   * Will fetch from API if not in cache
   */
  public async getTokenMetadata(
    tokenAddress: string
  ): Promise<typeof tokensTable.$inferSelect | null> {
    // Check cache first
    if (this.tokenCache.has(tokenAddress)) {
      return this.tokenCache.get(tokenAddress)!;
    }

    // Check database
    const token = await db
      .select()
      .from(tokensTable)
      .where(eq(tokensTable.address, tokenAddress))
      .limit(1);

    if (token.length > 0) {
      this.tokenCache.set(tokenAddress, token[0]);
      return token[0];
    }

    // Fetch from Solana network
    try {
      const metadata = await this.fetchTokenMetadata(tokenAddress);
      if (metadata) {
        const savedToken = await this.saveTokenMetadata(metadata);
        return savedToken;
      }
    } catch (error) {
      console.error(
        `Error fetching metadata for token ${tokenAddress}:`,
        error
      );
    }

    // No metadata found, create basic record
    const basicToken = {
      address: tokenAddress,
      symbol: this.generateShortSymbol(tokenAddress),
      name: this.generateShortSymbol(tokenAddress),
      createdAt: new Date(),
      lastUpdated: new Date(),
    };

    return this.saveTokenMetadata(basicToken);
  }

  /**
   * Fetch token metadata from Solana network
   */
  private async fetchTokenMetadata(tokenAddress: string): Promise<any> {
    try {
      // Basic validation
      const pubkey = new PublicKey(tokenAddress);

      // Fetch token metadata on-chain
      // This is a simplified version - in production you would use metaplex or a token API
      const accountInfo = await this.connection.getAccountInfo(pubkey);

      if (!accountInfo) {
        console.log(`No account info found for token ${tokenAddress}`);
        return null;
      }

      // For now, return a basic structure - in production, parse token metadata properly
      return {
        address: tokenAddress,
        symbol: this.generateShortSymbol(tokenAddress),
        name: this.generateShortSymbol(tokenAddress),
        decimals: null,
        lastUpdated: new Date(),
      };
    } catch (error) {
      console.error(
        `Error fetching token metadata for ${tokenAddress}:`,
        error
      );
      return null;
    }
  }

  /**
   * Save token metadata to database
   */
  private async saveTokenMetadata(
    tokenData: Partial<typeof tokensTable.$inferInsert>
  ): Promise<typeof tokensTable.$inferSelect> {
    try {
      // Ensure required fields
      const token = {
        address: tokenData.address!,
        symbol:
          tokenData.symbol || this.generateShortSymbol(tokenData.address!),
        name: tokenData.name || tokenData.symbol || "Unknown Token",
        decimals: tokenData.decimals || null,
        logoUrl: tokenData.logoUrl || null,
        coingeckoId: tokenData.coingeckoId || null,
        lastPrice: tokenData.lastPrice || null,
        lastUpdated: new Date(),
        isVerified: tokenData.isVerified || false,
        metadata: tokenData.metadata || {},
      };

      // Insert into database
      const result = await db
        .insert(tokensTable)
        .values(token)
        .onConflictDoUpdate({
          target: [tokensTable.address],
          set: token,
        })
        .returning();

      if (result && result.length > 0) {
        // Update cache
        this.tokenCache.set(token.address, result[0]);
        return result[0];
      }

      throw new Error("Failed to save token metadata");
    } catch (error) {
      console.error(`Error saving token metadata:`, error);
      throw error;
    }
  }

  /**
   * Generate a short symbol for tokens with no metadata
   * e.g., "ABC...XYZ" from the address
   */
  private generateShortSymbol(address: string): string {
    if (address === "So11111111111111111111111111111111111111112") {
      return "SOL"; // Special case for wrapped SOL
    }

    const start = address.substring(0, 3);
    const end = address.substring(address.length - 3);
    return `${start}...${end}`;
  }

  /**
   * Update token price
   */
  public async updateTokenPrice(tokenAddress: string, priceUsd: number) {
    try {
      await db
        .update(tokensTable)
        .set({
          lastPrice: priceUsd.toString(),
          lastUpdated: new Date(),
        })
        .where(eq(tokensTable.address, tokenAddress));

      // Update cache if token exists
      if (this.tokenCache.has(tokenAddress)) {
        const token = this.tokenCache.get(tokenAddress)!;
        this.tokenCache.set(tokenAddress, {
          ...token,
          lastPrice: priceUsd.toString(),
          lastUpdated: new Date(),
        });
      }
    } catch (error) {
      console.error(`Error updating token price:`, error);
    }
  }
}
