import mongoose from "mongoose";

const vectorChunkSchema = new mongoose.Schema({
    chunkId: { type: String, required: true, unique: true },
    apiIndexId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiIndex', required: true },

    // Organization identification for multi-tenancy
    zohoOrgId: { type: String, required: true, index: true },
    namespace: { type: String, required: true, index: true },

    endpointId: String, // Reference to endpoint if chunk is endpoint-specific
    intentId: String, // Reference to intent if chunk is intent-specific
    chunkType: {
        type: String,
        enum: ['endpoint_description', 'tag', 'example', 'logic', 'use_case', 'general'],
        required: true
    },
    content: { type: String, required: true },
    metadata: {
        title: String,
        tags: [String],
        context: mongoose.Schema.Types.Mixed
    },
    // Embeddings are stored in Pinecone, not MongoDB
    pineconeId: String, // Pinecone vector ID for reference
    embeddingModel: String, // e.g., "text-embedding-004" (Gemini)
    createdAt: { type: Date, default: Date.now }
});

vectorChunkSchema.index({ apiIndexId: 1, endpointId: 1 });
vectorChunkSchema.index({ chunkType: 1 });
vectorChunkSchema.index({ 'metadata.tags': 1 });

export default mongoose.model("VectorChunk", vectorChunkSchema);

