import mongoose from "mongoose";

const parameterSchema = new mongoose.Schema({
    name: String,
    in: String, // query, path, header, cookie
    description: String,
    required: Boolean,
    schema: mongoose.Schema.Types.Mixed,
    example: mongoose.Schema.Types.Mixed
}, { _id: false });

const requestBodySchema = new mongoose.Schema({
    required: Boolean,
    description: String,
    contentTypes: [String],
    schema: mongoose.Schema.Types.Mixed,
    example: mongoose.Schema.Types.Mixed
}, { _id: false });

const responseSchema = new mongoose.Schema({
    description: String,
    contentTypes: [String],
    schema: mongoose.Schema.Types.Mixed,
    example: mongoose.Schema.Types.Mixed
}, { _id: false });

const exampleSchema = new mongoose.Schema({
    requests: [{
        contentType: String,
        body: mongoose.Schema.Types.Mixed
    }],
    responses: [{
        statusCode: Number,
        contentType: String,
        body: mongoose.Schema.Types.Mixed
    }]
}, { _id: false });

const endpointSchema = new mongoose.Schema({
    endpointId: { type: String, required: true },
    path: { type: String, required: true },
    method: { type: String, required: true, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] },
    summary: String,
    description: String,
    operationId: String,
    tags: [String],
    businessTags: [String], // LLM-generated business context tags
    parameters: [parameterSchema],
    requestBody: requestBodySchema,
    responses: mongoose.Schema.Types.Mixed, // { statusCode: responseSchema }
    security: [mongoose.Schema.Types.Mixed],
    deprecated: Boolean,
    examples: exampleSchema
}, { _id: false });

const apiIndexSchema = new mongoose.Schema({
    apiDocId: { type: mongoose.Schema.Types.ObjectId, ref: 'ApiDoc', required: true },

    // Organization identification for multi-tenancy
    zohoOrgId: { type: String, required: true, index: true },
    namespace: { type: String, required: true, index: true },

    metadata: {
        format: String,
        version: String,
        title: String,
        description: String,
        baseUrl: String,
        parsedAt: Date
    },
    endpoints: [endpointSchema],
    securitySchemes: mongoose.Schema.Types.Mixed,
    components: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

apiIndexSchema.index({ 'endpoints.endpointId': 1 });
apiIndexSchema.index({ 'endpoints.path': 1, 'endpoints.method': 1 });
apiIndexSchema.index({ 'endpoints.tags': 1 });
apiIndexSchema.index({ 'endpoints.businessTags': 1 });

export default mongoose.model("ApiIndex", apiIndexSchema);



