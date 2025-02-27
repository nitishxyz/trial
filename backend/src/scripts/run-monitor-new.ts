import { WalletMonitorServiceNew } from "../services/wallet/monitor-new";
import { TokenMetadataService } from "../services/token/metadata";
import { WebSocketService } from "../services/websocket/server";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
  console.log("Starting new wallet monitoring service...");

  if (!process.env.SOLANA_RPC_URL) {
    console.error(
      "Error: SOLANA_RPC_URL is not defined in environment variables."
    );
    process.exit(1);
  }

  try {
    // Initialize token metadata service
    console.log("Initializing token metadata service...");
    const tokenService = TokenMetadataService.getInstance();
    await tokenService.initialize();

    // Initialize wallet monitor service (which will use the token service)
    console.log("Initializing wallet monitoring service...");
    const monitorService = WalletMonitorServiceNew.getInstance();
    await monitorService.initialize();

    // Initialize WebSocket service
    console.log("Initializing WebSocket service...");
    WebSocketService.getInstance(8080);

    console.log("All services started successfully!");
    console.log("Press Ctrl+C to stop.");
  } catch (error) {
    console.error("Failed to start services:", error);
    process.exit(1);
  }
}

// Start the service
main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
