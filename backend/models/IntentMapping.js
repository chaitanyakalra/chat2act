import mongoose from "mongoose";

const parameterMappingSchema = new mongoose.Schema({
    userInputPattern: String, // How user input maps to this parameter
    parameterName: String,
    transformation: String, // Optional transformation logic
    constraints: mongoose.Schema.Types.Mixed
}, { _id: false });

const subIntentSchema = new mongoose.Schema({
    subIntentId: String,
    name: String,
    description: String,
    endpointIds: [String], // References to endpointIds in ApiIndex
    parameterMappings: [parameterMappingSchema],
    requiredFields: [String],
    constraints: mongoose.Schema.Types.Mixed,
    exampleQueries: [String]
}, { _id: false });

const intentSchema = new mongoose.Schema({
    intentId: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    category: String, // e.g., "data_retrieval", "data_modification", "authentication"
    subIntents: [subIntentSchema],
    commonUseCases: [String],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const intentMappingSchema = new mongoose.Schema({
    apiIndexId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiIndex', required: true },
    intents: [intentSchema],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

intentMappingSchema.index({ 'intents.intentId': 1 });
intentMappingSchema.index({ 'intents.category': 1 });
intentMappingSchema.index({ 'intents.subIntents.endpointIds': 1 });

export default mongoose.model("IntentMapping", intentMappingSchema);

