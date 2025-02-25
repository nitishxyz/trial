import { PublicKey } from "@solana/web3.js";

export interface TradeInfo {
  signature: string;
  walletAddress: string;
  tokenA: string;
  tokenB: string;
  type: "buy" | "sell";
  amountA: number;
  amountB: number;
  priceUsd: number;
  platform: string;
  txFees: number;
  timestamp: Date;
  rawData: any;
}

export interface TokenPosition {
  mint: string;
  amount: number;
  averageEntryPrice: number;
}

export interface WalletBalance {
  wallet: PublicKey;
  positions: TokenPosition[];
  lastUpdated: Date;
}
