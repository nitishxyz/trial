import "dotenv/config";
import { WalletMonitorServiceNew } from "./src/services/wallet/monitor-new";
import { WebSocketService } from "./src/services/websocket/server";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT) : 8080;

async function main() {
  console.log("🚀 Starting backend server...");

  // Initialize wallet monitoring service (using the new implementation)
  const monitorService = WalletMonitorServiceNew.getInstance();
  await monitorService.initialize();

  // Initialize WebSocket service
  const wsService = WebSocketService.getInstance(WS_PORT);

  console.log(`✅ Server started on port ${PORT}`);
  console.log(`✅ WebSocket server started on port ${WS_PORT}`);

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("Shutting down server...");
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("❌ Error starting server:", error);
  process.exit(1);
});
