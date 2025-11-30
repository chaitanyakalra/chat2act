import "dotenv/config";
import mongoose from "mongoose";

async function checkIndexes() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ Connected to MongoDB");

        const indexes = await mongoose.connection.collection('organizations').indexes();
        console.log("📊 Current Indexes:");
        console.log(JSON.stringify(indexes, null, 2));

        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

checkIndexes();
