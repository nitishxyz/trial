# Solana Trading Monitor Backend

Backend service for monitoring Solana wallet trading activity with WebSocket support.

## Features

- Real-time wallet monitoring
- Transaction detection across multiple DEXes
- Daily PnL tracking
- WebSocket integration for live frontend updates

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Create a `.env` file with the following variables:
   ```
   DATABASE_URL=postgres://username:password@localhost:5432/yourdb
   SOLANA_RPC_URL=https://your-solana-rpc-endpoint
   PORT=3000
   WS_PORT=8080
   ```

3. Run the server:
   ```bash
   bun run index.ts
   ```

## WebSocket API

The WebSocket server allows frontend clients to subscribe to real-time updates:

### Message Types

- `SUBSCRIBE_WALLET`: Subscribe to a wallet's updates
- `UNSUBSCRIBE_WALLET`: Unsubscribe from a wallet's updates
- `TRADE_UPDATE`: Receive new trade notifications
- `BALANCE_UPDATE`: Receive balance changes
- `PNL_UPDATE`: Receive PnL updates

### Example Client Usage

```javascript
const ws = new WebSocket('ws://localhost:8080');

// Subscribe to wallet updates
ws.send(JSON.stringify({
  type: 'SUBSCRIBE_WALLET',
  data: {
    walletAddress: 'solana-wallet-address'
  }
}));

// Handle messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'TRADE_UPDATE':
      console.log('New trade:', message.data);
      break;
    case 'BALANCE_UPDATE':
      console.log('Balance update:', message.data);
      break;
    case 'PNL_UPDATE':
      console.log('PnL update:', message.data);
      break;
  }
};
```

## Development

- Database management:
  ```bash
  bunx drizzle-kit generate:pg
  ```
  
- Run seeds:
  ```bash
  bun run seed
  ```

- Test monitor script:
  ```bash
  bun run monitor
  ```

This project is built using [Bun](https://bun.sh), a fast all-in-one JavaScript runtime.
