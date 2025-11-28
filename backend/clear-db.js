/**
 * Clear all Phase 1 data from MongoDB
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function clearDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            tls: true,
            tlsAllowInvalidCertificates: true,
            serverSelectionTimeoutMS: 10000,
        });
        console.log('✅ Connected to MongoDB');

        // Drop all collections
        const collections = ['apidocs', 'apiindexes', 'intentmappings', 'vectorchunks'];

        for (const collectionName of collections) {
            try {
                await mongoose.connection.db.collection(collectionName).drop();
                console.log(`✅ Dropped collection: ${collectionName}`);
            } catch (error) {
                if (error.code === 26) {
                    console.log(`⚠️  Collection ${collectionName} doesn't exist, skipping`);
                } else {
                    console.error(`❌ Error dropping ${collectionName}:`, error.message);
                }
            }
        }

        console.log('\n🎉 Database cleared successfully!');
        console.log('You can now upload your API spec again.\n');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

clearDatabase();
