/**
 * Test Vector Search
 * 
 * This script tests the end-to-end vector search pipeline:
 * 1. Generate embedding for a test query
 * 2. Search Pinecone for similar vectors
 * 3. Retrieve matching chunks from MongoDB
 * 4. Display results
 */

import { Pinecone } from '@pinecone-database/pinecone';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Test query - you can change this
const TEST_QUERY = "update user information";

async function testVectorSearch() {
    try {
        console.log('🧪 Testing Vector Search Pipeline\n');
        console.log('='.repeat(80));
        console.log(`Test Query: "${TEST_QUERY}"`);
        console.log('='.repeat(80));

        // Step 1: Generate embedding for test query
        console.log('\n📊 Step 1: Generating embedding for test query...');
        const embedding = await generateEmbedding(TEST_QUERY);
        console.log(`✅ Generated ${embedding.length}-dimensional embedding`);
        console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

        // Step 2: Search Pinecone
        console.log('\n🔍 Step 2: Searching Pinecone for similar vectors...');
        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY,
        });
        const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

        const searchResults = await index.query({
            vector: embedding,
            topK: 5,
            includeMetadata: true
        });

        console.log(`✅ Found ${searchResults.matches.length} matches`);

        // Display Pinecone results
        console.log('\n📋 Pinecone Search Results:');
        searchResults.matches.forEach((match, i) => {
            console.log(`\n  Match #${i + 1}:`);
            console.log(`    Score: ${match.score.toFixed(4)} (${(match.score * 100).toFixed(2)}% similar)`);
            console.log(`    Vector ID: ${match.id}`);
            console.log(`    Chunk Type: ${match.metadata.chunkType}`);
            console.log(`    Title: ${match.metadata.title}`);
            console.log(`    Content Preview: ${match.metadata.content.substring(0, 100)}...`);
            if (match.metadata.endpointId) {
                console.log(`    Endpoint ID: ${match.metadata.endpointId}`);
            }
            if (match.metadata.method && match.metadata.path) {
                console.log(`    API Endpoint: ${match.metadata.method} ${match.metadata.path}`);
            }
        });

        // Step 3: Retrieve full chunks from MongoDB
        console.log('\n💾 Step 3: Retrieving full chunk details from MongoDB...');
        await mongoose.connect(process.env.MONGO_URI, {
            tls: true,
            tlsAllowInvalidCertificates: true,
            serverSelectionTimeoutMS: 10000,
        });
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;

        // Extract chunk IDs from Pinecone results
        const chunkIds = searchResults.matches.map(match => match.metadata.chunkId);
        const chunks = await db.collection('vectorchunks').find({
            chunkId: { $in: chunkIds }
        }).toArray();

        console.log(`✅ Retrieved ${chunks.length} chunks from MongoDB`);

        // Display MongoDB chunk details
        console.log('\n📦 MongoDB Chunk Details:');
        chunks.forEach((chunk, i) => {
            const matchingResult = searchResults.matches.find(m => m.metadata.chunkId === chunk.chunkId);
            console.log(`\n  Chunk #${i + 1}:`);
            console.log(`    Similarity Score: ${matchingResult.score.toFixed(4)}`);
            console.log(`    Chunk ID: ${chunk.chunkId}`);
            console.log(`    Chunk Type: ${chunk.chunkType}`);
            console.log(`    Pinecone ID: ${chunk.pineconeId}`);
            console.log(`    Full Content:\n      ${chunk.content.split('\n').join('\n      ')}`);
            console.log(`    Metadata:`, JSON.stringify(chunk.metadata, null, 6));
        });

        // Step 4: Verify correctness
        console.log('\n✅ VERIFICATION:');
        console.log('='.repeat(80));

        const topMatch = searchResults.matches[0];
        const topChunk = chunks.find(c => c.chunkId === topMatch.metadata.chunkId);

        console.log(`\n🎯 Top Match Analysis:`);
        console.log(`   Query: "${TEST_QUERY}"`);
        console.log(`   Best Match: ${topMatch.metadata.title}`);
        console.log(`   Similarity: ${(topMatch.score * 100).toFixed(2)}%`);
        console.log(`   Chunk Type: ${topMatch.metadata.chunkType}`);

        if (topMatch.metadata.method && topMatch.metadata.path) {
            console.log(`   API Endpoint: ${topMatch.metadata.method} ${topMatch.metadata.path}`);
        }

        console.log(`\n   Expected Result: Should match "GET /users" or "List all users" related content`);

        const isCorrect = topChunk.content.toLowerCase().includes('list') &&
            topChunk.content.toLowerCase().includes('users');

        if (isCorrect) {
            console.log(`   ✅ CORRECT: Top match is relevant to the query!`);
        } else {
            console.log(`   ⚠️  WARNING: Top match may not be the most relevant`);
        }

        console.log('\n' + '='.repeat(80));
        console.log('🎉 Test completed successfully!');
        console.log('\nYou can modify the TEST_QUERY constant at the top of this script');
        console.log('to test different queries like:');
        console.log('  - "create a new user"');
        console.log('  - "get user by id"');
        console.log('  - "delete user"');
        console.log('  - "update user information"');

    } catch (error) {
        console.error('\n❌ Error during test:', error);
        console.error('\nStack trace:', error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\n✅ Disconnected from MongoDB');
    }
}

/**
 * Generate embedding using Gemini API
 */
async function generateEmbedding(text) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY not found in environment variables');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            content: {
                parts: [{
                    text: text
                }]
            }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const embedding = data.embedding?.values || data.embedding || [];

    if (!embedding || embedding.length === 0) {
        throw new Error('Empty embedding returned from Gemini API');
    }

    return embedding;
}

// Run the test
testVectorSearch();
