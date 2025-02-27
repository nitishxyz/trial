# New Wallet Monitoring Service

This service tracks Solana wallet activity, detects trades, and calculates PnL based on SOL and token balance changes.

## Features

- **Balance-Based Trade Detection**: Uses SOL and token balance changes to detect trades
  - SOL decreases + Token increases = Buy
  - SOL increases + Token decreases = Sell
- **Transfer Detection**: Identifies token transfers (deposits/withdrawals)
- **Daily PnL Tracking**: Records realized PnL for each day in PST timezone
- **Persistent Storage**: Stores all trades and PnL records in the database
- **Trade/Transfer Classification**: Uses SOL and token balance changes to distinguish between trades and transfers
- **Real-time Monitoring**: Updates every 5 seconds, caching previous transactions to avoid duplicates
- **Today-Only Processing**: Only processes today's transactions for accurate daily PnL tracking
- **Clean Startup**: Resets PnL counters on startup to prevent accumulation from multiple runs

## Setup

1. Ensure you have the necessary environment variables:

   ```
   SOLANA_RPC_URL=your_rpc_url_here
   DATABASE_URL=your_database_connection_string
   ```

2. Make sure the database is properly set up with the required tables:
   - `users`
   - `trades`
   - `pnl_records`

## Usage

Run the service using:

```bash
bun run monitor:new
```

The service will:

1. Load all active wallets from the database (where `isLive = true`)
2. Reset today's PnL records to ensure a clean state
3. Fetch current balances and initialize PnL records
4. Start monitoring transactions for all wallets
5. Process and classify today's transactions as buys, sells, or transfers
6. Track PnL for today's trading activity only

## Differences from the Previous Monitor

The new wallet monitoring service:

1. Uses **balance changes** to classify trades, not program IDs
2. Provides more detailed logging for easier debugging
3. Has simpler, more reliable trade classification logic
4. Properly handles tracking of PnL for each trade
5. Correctly distinguishes between transfers and trades
6. Ignores transactions with negligible SOL changes (fees only)
7. Processes only today's transactions for accurate daily PnL
8. Resets PnL counters on startup to prevent accumulation issues

## PnL Handling

- PnL is calculated on a per-trade basis:
  - For buys: PnL = -SOL_CHANGE (negative since you're spending SOL)
  - For sells: PnL = +SOL_CHANGE (positive since you're gaining SOL)
- Only today's transactions affect today's PnL
- PnL records are reset on service startup to prevent double-counting

## Troubleshooting

- If you see `No token balance changes for wallet` messages, this is normal for transactions that don't involve tokens
- If the service can't connect to the RPC, check your SOLANA_RPC_URL environment variable
- If database operations fail, verify your DATABASE_URL and that all required tables exist
- If you see `Skipping transaction from: ... - Not from today` messages, this is normal and indicates the service is properly filtering historical transactions

## Development

The main components are:

- `src/services/wallet/monitor-new.ts`: Core monitoring logic
- `src/scripts/run-monitor-new.ts`: Script to run the service
