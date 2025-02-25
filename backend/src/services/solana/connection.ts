import {
  Connection,
  PublicKey,
  type Commitment,
  Keypair,
} from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import "dotenv/config";

export class SolanaConnectionService {
  private static instance: SolanaConnectionService;
  private connection: Connection;
  private provider: AnchorProvider;

  private constructor() {
    const endpoint = process.env.SOLANA_RPC_URL!;
    const commitment: Commitment = "confirmed";

    this.connection = new Connection(endpoint, {
      commitment,
      wsEndpoint: endpoint.replace("https", "wss"),
    });

    // Create a dummy wallet since we're only reading
    const dummyWallet = {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };

    // Initialize provider with dummy wallet
    this.provider = new AnchorProvider(this.connection, dummyWallet, {
      commitment,
    });
  }

  public static getInstance(): SolanaConnectionService {
    if (!SolanaConnectionService.instance) {
      SolanaConnectionService.instance = new SolanaConnectionService();
    }
    return SolanaConnectionService.instance;
  }

  public getConnection(): Connection {
    return this.connection;
  }

  public getProvider(): AnchorProvider {
    return this.provider;
  }
}
