/**
 * Processing Pipeline - Orchestrates Phase 1 processing
 */

import { ApiParserService } from './apiParserService.js';
import { LLMService } from './llmService.js';
import { VectorDbService } from './vectorDbService.js';
import ApiIndex from '../models/ApiIndex.js';
import IntentMapping from '../models/IntentMapping.js';
import fs from 'fs';

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(message);
    fs.appendFileSync('debug.log', logMessage);
}

export class ProcessingPipeline {
    constructor() {
        this.llmService = new LLMService();
        this.vectorDbService = new VectorDbService();
    }

    /**
     * Main processing function - processes uploaded API documentation
     */
    async process(apiDocId, rawText, mimeType) {
        try {
            log(`Starting Phase 1 processing for doc ${apiDocId}`);

            // Step 1: Parse API documentation
            log('Step 1: Parsing API documentation...');
            const parsed = await ApiParserService.parse(rawText, mimeType);
            log(`Parsed ${parsed.endpoints.length} endpoints`);

            // Step 2: Create structured API index
            log('Step 2: Creating structured API index...');
            const apiIndex = await this.createApiIndex(apiDocId, parsed);
            log(`Created API index: ${apiIndex._id}`);

            // Step 3: Generate business tags using LLM
            log('Step 3: Generating business tags...');
            const businessTags = await this.llmService.generateBusinessTags(parsed.endpoints);
            await this.updateBusinessTags(apiIndex._id, businessTags);
            log('Business tags generated');

            // Step 4: Generate intent mappings using LLM
            log('Step 4: Generating intent mappings...');
            const intents = await this.llmService.generateIntentMappings(
                parsed.endpoints,
                parsed.metadata
            );
            const intentMapping = await this.createIntentMapping(apiIndex._id, intents);
            log(`Created ${intents.length} intents with ${intents.reduce((sum, i) => sum + (i.subIntents?.length || 0), 0)} sub-intents`);

            // Step 5: Reload API index with business tags for vector DB
            const updatedApiIndex = await ApiIndex.findById(apiIndex._id);
            const updatedIntentMapping = await IntentMapping.findById(intentMapping._id);

            // Step 6: Initialize Pinecone and create vector DB chunks
            log('Step 5: Initializing Pinecone...');
            await this.vectorDbService.initializeIndex();
            log('Step 6: Creating vector DB chunks...');
            const chunks = await this.vectorDbService.createChunks(updatedApiIndex, updatedIntentMapping);
            log(`Created ${chunks.length} vector chunks`);

            return {
                success: true,
                apiIndexId: apiIndex._id,
                intentMappingId: intentMapping._id,
                stats: {
                    endpoints: parsed.endpoints.length,
                    intents: intents.length,
                    subIntents: intents.reduce((sum, i) => sum + (i.subIntents?.length || 0), 0),
                    vectorChunks: chunks.length
                }
            };
        } catch (error) {
            log(`Processing pipeline error: ${error.message}`);
            console.error('Processing pipeline error:', error);
            throw new Error(`Processing failed: ${error.message}`);
        }
    }

    /**
     * Create API index in database
     */
    async createApiIndex(apiDocId, parsed) {
        const apiIndex = new ApiIndex({
            apiDocId,
            metadata: parsed.metadata,
            endpoints: parsed.endpoints,
            securitySchemes: parsed.securitySchemes,
            components: parsed.components
        });

        await apiIndex.save();
        return apiIndex;
    }

    /**
     * Update business tags on endpoints
     */
    async updateBusinessTags(apiIndexId, businessTags) {
        const apiIndex = await ApiIndex.findById(apiIndexId);
        if (!apiIndex) throw new Error('API index not found');

        // Update each endpoint with its business tags
        apiIndex.endpoints = apiIndex.endpoints.map(endpoint => {
            if (businessTags[endpoint.endpointId]) {
                endpoint.businessTags = businessTags[endpoint.endpointId];
            }
            return endpoint;
        });

        apiIndex.updatedAt = new Date();
        await apiIndex.save();
    }

    /**
     * Create intent mapping in database
     */
    async createIntentMapping(apiIndexId, intents) {
        // Generate unique intent IDs if not provided
        const processedIntents = intents.map((intent, idx) => ({
            intentId: intent.intentId || `intent_${apiIndexId}_${idx}`,
            name: intent.name,
            description: intent.description,
            category: intent.category,
            subIntents: (intent.subIntents || []).map((subIntent, subIdx) => ({
                subIntentId: subIntent.subIntentId || `sub_${apiIndexId}_${idx}_${subIdx}`,
                name: subIntent.name,
                description: subIntent.description,
                endpointIds: subIntent.endpointIds || [],
                parameterMappings: subIntent.parameterMappings || [],
                requiredFields: subIntent.requiredFields || [],
                constraints: subIntent.constraints || {},
                exampleQueries: subIntent.exampleQueries || []
            })),
            commonUseCases: intent.commonUseCases || []
        }));

        const intentMapping = new IntentMapping({
            apiIndexId,
            intents: processedIntents
        });

        await intentMapping.save();
        return intentMapping;
    }

    /**
     * Get processing status
     */
    async getStatus(apiDocId) {
        const apiIndex = await ApiIndex.findOne({ apiDocId });
        if (!apiIndex) {
            return { status: 'not_started', message: 'Processing not started' };
        }

        const intentMapping = await IntentMapping.findOne({ apiIndexId: apiIndex._id });
        const VectorChunk = (await import('../models/VectorChunk.js')).default;
        const chunkCount = await VectorChunk.countDocuments({ apiIndexId: apiIndex._id });

        return {
            status: 'completed',
            apiIndexId: apiIndex._id,
            intentMappingId: intentMapping?._id,
            stats: {
                endpoints: apiIndex.endpoints.length,
                intents: intentMapping?.intents.length || 0,
                vectorChunks: chunkCount
            }
        };
    }
}

