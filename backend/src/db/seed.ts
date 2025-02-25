import { db } from "./index";
import { usersTable } from "./schema";

async function seed() {
  try {
    // Clear existing data
    await db.delete(usersTable);

    // Insert streamers
    await db.insert(usersTable).values([
      {
        displayName: "KREO",
        email: "kreo@example.com", // placeholder email
        walletAddress: "BCnqsPEtA1TkgednYEebRpkmwFRJDCjMQcKZMMtEdArc",
        streamPlatform: "twitch",
        streamUrl: "https://twitch.tv/kreo",
        isLive: false,
        isAdmin: false,
        createdAt: new Date(),
      },
      {
        displayName: "GH0STEE",
        email: "ghostee@example.com", // placeholder email
        walletAddress: "2kv8X2a9bxnBM8NKLc6BBTX2z13GFNRL4oRotMUJRva9",
        streamPlatform: "twitch",
        streamUrl: "https://twitch.tv/gh0stee",
        isLive: false,
        isAdmin: false,
        createdAt: new Date(),
      },
    ]);

    console.log("✅ Seed data inserted successfully");
  } catch (error) {
    console.error("❌ Error seeding data:", error);
  } finally {
    process.exit(0);
  }
}

seed();
