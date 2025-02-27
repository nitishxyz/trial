# Web3 Project Context

## Project Overview
This is a web3 application with a backend service for Solana blockchain monitoring and a Next.js frontend interface. The project follows a modern fullstack architecture with TypeScript throughout.

## Backend Architecture
- **Tech Stack**: Bun runtime, TypeScript, PostgreSQL (with Drizzle ORM), Redis
- **Key Features**:
  - Solana wallet/transaction monitoring service
  - WebSocket service for real-time updates
  - Database operations via Drizzle ORM
  - Service-oriented design pattern

## Frontend Architecture
- **Tech Stack**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Key Features**:
  - Modern React with Server Components
  - Responsive UI built with Tailwind
  - TypeScript for type safety

## Project Structure
- `/backend`: Solana monitoring services and API
  - `/src/db`: Database schema and connections
  - `/src/services`: Core business logic services
  - `/src/types`: TypeScript type definitions
- `/frontend`: Next.js web application
  - `/app`: Application routes and pages
  - `/public`: Static assets

## Development Workflow
- Backend and frontend can be developed independently
- Backend exposes APIs consumed by the frontend
- Environment variables control configuration for different environments

## Common Commands
- Start backend: `cd backend && bun run index.ts`
- Start frontend: `cd frontend && npm run dev`
- Full application: Run both backend and frontend concurrently

See individual CLAUDE.md files in each directory for specific commands and guidelines.