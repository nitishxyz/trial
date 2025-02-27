# Project Context: Solana Trading Monitor

## Overview
This project is a backend service that monitors Solana wallets for trading activity. It's designed to track traders' transactions on various Solana DEXes (Decentralized Exchanges), calculate profit and loss (PnL), and store trading history for analysis.

## Core Features
- Real-time monitoring of Solana wallet transactions
- Detection and parsing of trades across multiple DEXes
- Tracking of daily PnL (Profit and Loss)
- Support for tracking streamers' trading activity
- Database storage of all trading activity

## Technical Architecture
- **Blockchain**: Solana blockchain monitoring using `@solana/web3.js`
- **Database**: PostgreSQL with Drizzle ORM for data storage
- **Caching**: Redis for performance optimization
- **Runtime**: Bun.js (TypeScript runtime)

## Main Components
- **WalletMonitorService**: Singleton service that polls for new transactions
- **Database Schema**: Tracks users, trades, PnL records, and token positions
- **Transaction Processing**: Identifies swaps, transfers, and calculates PnL

## Target Users
- Crypto traders who want to track their trading performance
- Content creators/streamers who showcase their trading activity
- Trading analytics platforms that need trade data