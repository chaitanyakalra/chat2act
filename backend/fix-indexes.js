import "dotenv/config";
import mongoose from "mongoose";
import Organization from "./models/Organization.js";

async function fixIndexes() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB");

        console.log("🔄 Dropping orgId_1 index...");
        try {
            await mongoose.connection.collection('organizations').dropIndex('orgId_1');
            console.log("✅ Index dropped");
        } catch (e) {
            console.log("⚠️  Index might not exist or already dropped:", e.message);
        }

        console.log("🔄 Syncing indexes...");
        await Organization.syncIndexes();
        console.log("✅ Indexes synced (orgId is now non-unique)");

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

fixIndexes();
