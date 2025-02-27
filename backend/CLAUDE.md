# Backend Project Guide

## Build & Run Commands
- Start development: `bun run index.ts`
- Seed database: `bun run seed`  
- Run monitoring script: `bun run monitor`
- Generate migrations: `bunx drizzle-kit generate:pg`
- Run tests: `bun test`
- Run specific test: `bun test src/path/to/test.ts`
- Typecheck: `bun run typecheck` or `bunx tsc --noEmit`

## Code Style Guidelines
- **Imports**: Group in order: external packages, internal modules, types
- **Formatting**: TypeScript with strict mode, 2-space indentation
- **Types**: Always define explicit return types for functions
- **Naming**: 
  - camelCase for variables and functions
  - PascalCase for classes, interfaces, and types
  - snake_case for database columns
  - Prefix interfaces with 'I' (e.g., IWalletService)

## Database & Architecture
- PostgreSQL with Drizzle ORM
- Redis for caching and pub/sub
- Service-oriented architecture with singleton patterns
- Schema in `src/db/schema.ts`

## Error Handling
- Use try/catch blocks around async operations 
- Create custom error classes for domain-specific errors
- Log errors with context details and stack traces
- Graceful degradation - services should handle dependency failures