import { WalletMonitorService } from "../services/wallet/monitor";
import { db } from "../db";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

async function main() {
  try {
    // Set test wallet as live
    await db
      .update(usersTable)
      .set({ isLive: true })
      .where(eq(usersTable.displayName, "GH0STEE"));

    console.log("🚀 Starting wallet monitor test...");

    const monitor = WalletMonitorService.getInstance();
    await monitor.initialize();

    console.log("👀 Monitoring for transactions...");
    console.log("Press Ctrl+C to stop");

    // Keep the process running
    process.on("SIGINT", async () => {
      console.log("\n🛑 Stopping monitor...");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main();
