import mongoose from "mongoose";

const apiDocSchema = new mongoose.Schema({
    // Organization identification
    zohoOrgId: { type: String, required: true, unique: true, index: true },
    organizationName: String,

    // Namespace for vector isolation in Pinecone
    namespace: { type: String, required: true, index: true },

    // API specification data
    rawText: String,
    title: String,
    version: String,
    baseUrl: String,

    // Processing status
    processingStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    processingError: String,

    // Timestamps
    uploadedAt: { type: Date, default: Date.now },
    processedAt: Date
});

export default mongoose.model("ApiDoc", apiDocSchema);
