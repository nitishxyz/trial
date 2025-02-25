import {
  pgTable,
  integer,
  varchar,
  timestamp,
  boolean,
  decimal,
  text,
  primaryKey,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users/Traders table
export const usersTable = pgTable(
  "users",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    walletAddress: varchar("wallet_address", { length: 44 }).notNull().unique(), // Solana public key (base58)
    streamPlatform: varchar("stream_platform", { length: 50 }), // 'twitch' or 'kick'
    streamUrl: varchar("stream_url", { length: 255 }),
    isLive: boolean("is_live").default(false),
    lastActive: timestamp("last_active"),
    isAdmin: boolean("is_admin").default(false),
    avatarUrl: varchar("avatar_url", { length: 255 }),
    twitterHandle: varchar("twitter_handle", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    uniqueIndex("users_wallet_address_idx").on(table.walletAddress),
    index("users_stream_platform_idx").on(table.streamPlatform),
    index("users_is_live_idx").on(table.isLive),
  ]
);

// Trade History table
export const tradesTable = pgTable(
  "trades",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id").references(() => usersTable.id),
    signature: varchar("signature", { length: 88 }).notNull().unique(), // Solana transaction signature
    walletAddress: varchar("wallet_address", { length: 44 }).notNull(),
    tokenA: varchar("token_a", { length: 44 }).notNull(), // Token mint address
    tokenB: varchar("token_b", { length: 44 }).notNull(), // Token mint address
    type: varchar("type", { length: 10 }).notNull(), // 'buy' or 'sell'
    amountA: decimal("amount_a", { precision: 20, scale: 9 }).notNull(), // Solana uses 9 decimals
    amountB: decimal("amount_b", { precision: 20, scale: 9 }).notNull(),
    priceUsd: decimal("price_usd", { precision: 20, scale: 6 }).notNull(),
    tradePnl: decimal("trade_pnl", { precision: 20, scale: 6 }), // PnL for this specific trade
    platform: varchar("platform", { length: 50 }).notNull(), // DEX name
    txFees: decimal("tx_fees", { precision: 10, scale: 9 }).notNull(), // in SOL
    timestamp: timestamp("timestamp").notNull(),
    rawData: json("raw_data"), // Store complete transaction data for reference
  },
  (table) => [
    uniqueIndex("trades_signature_idx").on(table.signature),
    index("trades_user_id_idx").on(table.userId),
    index("trades_wallet_address_idx").on(table.walletAddress),
    index("trades_timestamp_idx").on(table.timestamp),
    index("trades_tokens_idx").on(table.tokenA, table.tokenB),
  ]
);

// Daily PnL Records
export const pnlRecordsTable = pgTable(
  "pnl_records",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id").references(() => usersTable.id),
    walletAddress: varchar("wallet_address", { length: 44 }).notNull(),
    date: timestamp("date").notNull(), // Date in PST
    startBalance: decimal("start_balance", {
      precision: 20,
      scale: 9,
    }).notNull(),
    endBalance: decimal("end_balance", { precision: 20, scale: 9 }),
    realizedPnl: decimal("realized_pnl", { precision: 20, scale: 6 }).notNull(),
    unrealizedPnl: decimal("unrealized_pnl", { precision: 20, scale: 6 }),
    totalTrades: integer("total_trades").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("pnl_records_user_id_idx").on(table.userId),
    index("pnl_records_wallet_date_idx").on(table.walletAddress, table.date),
  ]
);

// Stream Sessions
export const streamSessionsTable = pgTable(
  "stream_sessions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id").references(() => usersTable.id),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time"),
    platform: varchar("platform", { length: 50 }).notNull(),
    streamUrl: varchar("stream_url", { length: 255 }).notNull(),
    isActive: boolean("is_active").default(true),
    lastHeartbeat: timestamp("last_heartbeat").notNull(),
  },
  (table) => [
    index("stream_sessions_user_id_idx").on(table.userId),
    index("stream_sessions_is_active_idx").on(table.isActive),
    index("stream_sessions_platform_idx").on(table.platform),
  ]
);

// Token Positions (for tracking open positions and unrealized PnL)
export const tokenPositionsTable = pgTable(
  "token_positions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id").references(() => usersTable.id),
    walletAddress: varchar("wallet_address", { length: 44 }).notNull(),
    tokenMint: varchar("token_mint", { length: 44 }).notNull(),
    amount: decimal("amount", { precision: 20, scale: 9 }).notNull(),
    averageEntryPrice: decimal("average_entry_price", {
      precision: 20,
      scale: 6,
    }).notNull(),
    currentPrice: decimal("current_price", { precision: 20, scale: 6 }),
    unrealizedPnl: decimal("unrealized_pnl", { precision: 20, scale: 6 }),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("token_positions_user_id_idx").on(table.userId),
    index("token_positions_wallet_token_idx").on(
      table.walletAddress,
      table.tokenMint
    ),
    index("token_positions_updated_at_idx").on(table.updatedAt),
  ]
);

// Add relations for all tables
export const usersRelations = relations(usersTable, ({ many }) => ({
  trades: many(tradesTable),
  pnlRecords: many(pnlRecordsTable),
  streamSessions: many(streamSessionsTable),
  tokenPositions: many(tokenPositionsTable),
}));

export const tradesRelations = relations(tradesTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [tradesTable.userId],
    references: [usersTable.id],
  }),
}));

export const pnlRecordsRelations = relations(pnlRecordsTable, ({ one }) => ({
  user: one(usersTable, {
    fields: [pnlRecordsTable.userId],
    references: [usersTable.id],
  }),
}));

export const streamSessionsRelations = relations(
  streamSessionsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [streamSessionsTable.userId],
      references: [usersTable.id],
    }),
  })
);

export const tokenPositionsRelations = relations(
  tokenPositionsTable,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [tokenPositionsTable.userId],
      references: [usersTable.id],
    }),
  })
);
