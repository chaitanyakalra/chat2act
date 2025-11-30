import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

async function clearPineconeIndex() {
    try {
        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
        });

        const indexName = process.env.PINECONE_INDEX_NAME;
        const index = pinecone.index(indexName);

        console.log(`🗑️  Deleting all vectors from index: ${indexName}...`);

        // Delete all vectors in the namespace (default namespace is empty string)
        await index.deleteAll();

        console.log('✅ All vectors deleted successfully!');

    } catch (error) {
        console.error('❌ Error deleting vectors:', error);
    }
}

clearPineconeIndex();
