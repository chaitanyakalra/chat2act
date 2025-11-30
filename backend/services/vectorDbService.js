/**
 * Vector DB Service for creating searchable embeddings
 * Uses Pinecone for vector storage and MongoDB for metadata
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';

export class VectorDbService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.embeddingModel = 'text-embedding-004'; // Gemini embedding model
        this.embeddingDimensions = 768; // Gemini embedding dimensions

        // Initialize Pinecone
        this.pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        });
        this.indexName = process.env.PINECONE_INDEX_NAME || 'chat2act-vectors';
        this.index = null;
    }

    /**
     * Initialize Pinecone index (call before using)
     */
    async initializeIndex() {
        try {
            if (this.index) {
                return this.index; // Already initialized
            }

            const indexList = await this.pinecone.listIndexes();
            const indexExists = indexList.indexes?.some(idx => idx.name === this.indexName);

            if (!indexExists) {
                // Create index if it doesn't exist
                const createOptions = {
                    name: this.indexName,
                    dimension: this.embeddingDimensions,
                    metric: 'cosine'
                };

                // Add serverless spec if region is provided
                const region = process.env.PINECONE_REGION || 'us-east-1';
                const cloud = process.env.PINECONE_CLOUD || 'aws';

                createOptions.spec = {
                    serverless: {
                        cloud: cloud,
                        region: region
                    }
                };

                await this.pinecone.createIndex(createOptions);
                console.log(`Created Pinecone index: ${this.indexName}`);

                // Wait a bit for index to be ready
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            this.index = this.pinecone.index(this.indexName);
            return this.index;
        } catch (error) {
            // If index already exists, just use it
            if (error.message?.includes('already exists') || error.message?.includes('IndexAlreadyExists')) {
                console.log(`Pinecone index ${this.indexName} already exists, using existing index`);
                this.index = this.pinecone.index(this.indexName);
                return this.index;
            }
            console.error('Error initializing Pinecone index:', error);
            throw error;
        }
    }

    /**
     * Create vector chunks from API index and intent mappings
     * @param {Object} apiIndex - The API index document
     * @param {Object} intentMappings - The intent mappings document
     * @param {String} namespace - Pinecone namespace for organization isolation (e.g., zohoOrgId)
     */
    async createChunks(apiIndex, intentMappings, namespace) {
        if (!namespace) {
            throw new Error('Namespace is required for multi-tenancy support');
        }
        const chunks = [];

        // 1. Chunk endpoint descriptions
        for (const endpoint of apiIndex.endpoints) {
            // Endpoint description chunk
            if (endpoint.description || endpoint.summary) {
                chunks.push({
                    endpointId: endpoint.endpointId,
                    chunkType: 'endpoint_description',
                    content: this.buildEndpointDescriptionContent(endpoint),
                    metadata: {
                        title: `${endpoint.method} ${endpoint.path}`,
                        tags: [...(endpoint.tags || []), ...(endpoint.businessTags || [])],
                        context: {
                            method: endpoint.method,
                            path: endpoint.path,
                            operationId: endpoint.operationId
                        }
                    }
                });
            }

            // Tag chunks
            if (endpoint.businessTags && endpoint.businessTags.length > 0) {
                chunks.push({
                    endpointId: endpoint.endpointId,
                    chunkType: 'tag',
                    content: `Tags: ${endpoint.businessTags.join(', ')}. Endpoint: ${endpoint.method} ${endpoint.path}. ${endpoint.summary || ''}`,
                    metadata: {
                        title: `Tags for ${endpoint.method} ${endpoint.path}`,
                        tags: endpoint.businessTags,
                        context: { endpointId: endpoint.endpointId }
                    }
                });
            }

            // Example chunks
            if (endpoint.examples) {
                if (endpoint.examples.requests && endpoint.examples.requests.length > 0) {
                    endpoint.examples.requests.forEach((req, idx) => {
                        chunks.push({
                            endpointId: endpoint.endpointId,
                            chunkType: 'example',
                            content: `Request example for ${endpoint.method} ${endpoint.path}:\n${JSON.stringify(req.body, null, 2)}`,
                            metadata: {
                                title: `Request example ${idx + 1} for ${endpoint.method} ${endpoint.path}`,
                                tags: ['example', 'request'],
                                context: { endpointId: endpoint.endpointId, exampleType: 'request' }
                            }
                        });
                    });
                }

                if (endpoint.examples.responses && endpoint.examples.responses.length > 0) {
                    endpoint.examples.responses.forEach((resp, idx) => {
                        chunks.push({
                            endpointId: endpoint.endpointId,
                            chunkType: 'example',
                            content: `Response example (${resp.statusCode}) for ${endpoint.method} ${endpoint.path}:\n${JSON.stringify(resp.body, null, 2)}`,
                            metadata: {
                                title: `Response example ${idx + 1} for ${endpoint.method} ${endpoint.path}`,
                                tags: ['example', 'response'],
                                context: { endpointId: endpoint.endpointId, exampleType: 'response', statusCode: resp.statusCode }
                            }
                        });
                    });
                }
            }

            // Logic chunks (parameter descriptions, constraints)
            if (endpoint.parameters && endpoint.parameters.length > 0) {
                const paramDescriptions = endpoint.parameters.map(p =>
                    `${p.name} (${p.in}): ${p.description || 'No description'}${p.required ? ' [REQUIRED]' : ''}`
                ).join('\n');

                chunks.push({
                    endpointId: endpoint.endpointId,
                    chunkType: 'logic',
                    content: `Parameters for ${endpoint.method} ${endpoint.path}:\n${paramDescriptions}`,
                    metadata: {
                        title: `Parameters for ${endpoint.method} ${endpoint.path}`,
                        tags: ['parameters', 'logic'],
                        context: { endpointId: endpoint.endpointId }
                    }
                });
            }
        }

        // 2. Chunk intent mappings
        if (intentMappings && intentMappings.intents) {
            for (const intent of intentMappings.intents) {
                // Intent description chunk
                chunks.push({
                    intentId: intent.intentId,
                    chunkType: 'use_case',
                    content: this.buildIntentContent(intent),
                    metadata: {
                        title: intent.name,
                        tags: [intent.category, 'intent'],
                        context: {
                            intentId: intent.intentId,
                            category: intent.category
                        }
                    }
                });

                // Sub-intent chunks
                if (intent.subIntents) {
                    for (const subIntent of intent.subIntents) {
                        chunks.push({
                            intentId: intent.intentId,
                            chunkType: 'use_case',
                            content: this.buildSubIntentContent(subIntent, intent),
                            metadata: {
                                title: `${intent.name}: ${subIntent.name}`,
                                tags: [intent.category, 'sub-intent'],
                                context: {
                                    intentId: intent.intentId,
                                    subIntentId: subIntent.subIntentId,
                                    endpointIds: subIntent.endpointIds
                                }
                            }
                        });

                        // Example query chunks
                        if (subIntent.exampleQueries && subIntent.exampleQueries.length > 0) {
                            subIntent.exampleQueries.forEach((query, idx) => {
                                chunks.push({
                                    intentId: intent.intentId,
                                    chunkType: 'use_case',
                                    content: `Example query: "${query}"\nThis maps to: ${subIntent.name}\nEndpoints: ${subIntent.endpointIds.join(', ')}`,
                                    metadata: {
                                        title: `Example query ${idx + 1} for ${subIntent.name}`,
                                        tags: ['example_query', intent.category],
                                        context: {
                                            intentId: intent.intentId,
                                            subIntentId: subIntent.subIntentId
                                        }
                                    }
                                });
                            });
                        }
                    }
                }
            }
        }

        // 3. Initialize Pinecone index if not already done
        if (!this.index) {
            await this.initializeIndex();
        }

        // 4. Generate embeddings and save chunks
        const VectorChunk = (await import('../models/VectorChunk.js')).default;
        const savedChunks = [];
        const vectorsToUpsert = [];

        for (const chunk of chunks) {
            try {
                const embedding = await this.generateEmbedding(chunk.content);
                const chunkId = `chunk_${apiIndex._id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const pineconeId = `vec_${chunkId}`;

                // Prepare vector for Pinecone
                const metadata = {
                    chunkId,
                    apiIndexId: apiIndex._id.toString(),
                    chunkType: chunk.chunkType,
                    content: chunk.content,
                    title: chunk.metadata.title || '',
                    tags: chunk.metadata.tags || [],
                    ...chunk.metadata.context
                };

                // Add optional fields only if they exist
                if (chunk.endpointId) metadata.endpointId = chunk.endpointId;
                if (chunk.intentId) metadata.intentId = chunk.intentId;

                vectorsToUpsert.push({
                    id: pineconeId,
                    values: embedding,
                    metadata
                });

                // Save metadata to MongoDB (without embedding)
                const vectorChunk = new VectorChunk({
                    chunkId,
                    apiIndexId: apiIndex._id,
                    zohoOrgId: apiIndex.zohoOrgId,
                    namespace: namespace,
                    endpointId: chunk.endpointId,
                    intentId: chunk.intentId,
                    chunkType: chunk.chunkType,
                    content: chunk.content,
                    metadata: chunk.metadata,
                    pineconeId,
                    embeddingModel: this.embeddingModel
                });

                await vectorChunk.save();
                savedChunks.push(vectorChunk);
            } catch (error) {
                console.error(`Error processing chunk: ${error.message}`);
            }
        }

        // 5. Batch upsert vectors to Pinecone with namespace isolation
        if (vectorsToUpsert.length > 0) {
            try {
                // Pinecone supports up to 100 vectors per upsert
                const batchSize = 100;
                for (let i = 0; i < vectorsToUpsert.length; i += batchSize) {
                    const batch = vectorsToUpsert.slice(i, i + batchSize);
                    // Use namespace for organization isolation
                    await this.index.namespace(namespace).upsert(batch);
                }
                console.log(`Upserted ${vectorsToUpsert.length} vectors to Pinecone namespace: ${namespace}`);
            } catch (error) {
                console.error('Error upserting vectors to Pinecone:', error);
                throw error;
            }
        }

        return savedChunks;
    }

    /**
     * Generate embedding for text
     */
    async generateEmbedding(text) {
        try {
            // Gemini embedding API - using REST API directly
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error('GEMINI_API_KEY not found in environment variables');
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.embeddingModel}:embedContent?key=${apiKey}`;

            console.log(`Generating embedding for text: ${text.substring(0, 100)}...`);

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
                console.error(`Embedding API error response: ${errorText}`);
                throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('Embedding API response structure:', Object.keys(data));

            // Gemini returns embedding in data.embedding.values
            const embedding = data.embedding?.values || data.embedding || [];

            if (!embedding || embedding.length === 0) {
                console.error('Empty embedding returned from API. Response:', JSON.stringify(data));
                throw new Error('Empty embedding returned from Gemini API');
            }

            // Validate that embedding is not all zeros
            const hasNonZero = embedding.some(val => val !== 0);
            if (!hasNonZero) {
                console.error('All-zero embedding returned from API');
                throw new Error('Gemini API returned all-zero embedding');
            }

            console.log(`Successfully generated embedding with ${embedding.length} dimensions`);
            return embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw error; // Don't return zero vector, throw the error instead
        }
    }

    /**
     * Build endpoint description content
     */
    buildEndpointDescriptionContent(endpoint) {
        let content = `${endpoint.method} ${endpoint.path}\n`;
        if (endpoint.summary) content += `Summary: ${endpoint.summary}\n`;
        if (endpoint.description) content += `Description: ${endpoint.description}\n`;
        if (endpoint.tags && endpoint.tags.length > 0) {
            content += `Tags: ${endpoint.tags.join(', ')}\n`;
        }
        if (endpoint.businessTags && endpoint.businessTags.length > 0) {
            content += `Business tags: ${endpoint.businessTags.join(', ')}\n`;
        }
        return content.trim();
    }

    /**
     * Build intent content
     */
    buildIntentContent(intent) {
        let content = `Intent: ${intent.name}\n`;
        if (intent.description) content += `Description: ${intent.description}\n`;
        content += `Category: ${intent.category}\n`;
        if (intent.commonUseCases && intent.commonUseCases.length > 0) {
            content += `Common use cases: ${intent.commonUseCases.join(', ')}\n`;
        }
        return content.trim();
    }

    /**
     * Build sub-intent content
     */
    buildSubIntentContent(subIntent, parentIntent) {
        let content = `Sub-intent: ${subIntent.name}\n`;
        if (subIntent.description) content += `Description: ${subIntent.description}\n`;
        content += `Parent intent: ${parentIntent.name}\n`;
        content += `Endpoints: ${subIntent.endpointIds.join(', ')}\n`;
        if (subIntent.requiredFields && subIntent.requiredFields.length > 0) {
            content += `Required fields: ${subIntent.requiredFields.join(', ')}\n`;
        }
        if (subIntent.parameterMappings && subIntent.parameterMappings.length > 0) {
            content += `Parameter mappings:\n`;
            subIntent.parameterMappings.forEach(pm => {
                content += `  - ${pm.parameterName}: ${pm.userInputPattern}\n`;
            });
        }
        return content.trim();
    }

    /**
     * Search chunks by similarity using Pinecone
     * @param {String} query - The search query
     * @param {String} apiIndexId - The API index ID to filter by
     * @param {String} namespace - Pinecone namespace for organization isolation
     * @param {Number} limit - Maximum number of results to return
     */
    async searchChunks(query, apiIndexId, namespace, limit = 10) {
        if (!namespace) {
            throw new Error('Namespace is required for multi-tenancy support');
        }
        try {
            // Initialize index if needed
            if (!this.index) {
                await this.initializeIndex();
            }

            // Generate query embedding
            const queryEmbedding = await this.generateEmbedding(query);

            // Query Pinecone with namespace isolation
            // Namespace provides organization-level isolation
            const queryOptions = {
                vector: queryEmbedding,
                topK: limit,
                includeMetadata: true
            };

            // Add metadata filter for apiIndexId if supported (paid plans)
            if (process.env.PINECONE_USE_FILTER === 'true') {
                queryOptions.filter = {
                    apiIndexId: { $eq: apiIndexId.toString() }
                };
            }

            // Query specific namespace for organization isolation
            const queryResponse = await this.index.namespace(namespace).query(queryOptions);
            console.log(`Searched namespace: ${namespace}, found ${queryResponse.matches?.length || 0} results`);

            // Get matching chunks from MongoDB using Pinecone IDs
            const VectorChunk = (await import('../models/VectorChunk.js')).default;

            // Namespace already provides organization isolation
            // Filter results by apiIndexId if not using Pinecone metadata filter
            let matches = queryResponse.matches || [];
            if (process.env.PINECONE_USE_FILTER !== 'true') {
                matches = matches.filter(match =>
                    match.metadata?.apiIndexId === apiIndexId.toString()
                );
            }

            const pineconeIds = matches.map(match => match.id);

            if (pineconeIds.length === 0) {
                return [];
            }

            // Fetch full chunk data from MongoDB
            // Filter by namespace for additional security
            const chunks = await VectorChunk.find({
                pineconeId: { $in: pineconeIds },
                apiIndexId: apiIndexId,
                namespace: namespace
            });

            // Map Pinecone results with scores to MongoDB chunks
            const scoredChunks = matches.map(match => {
                const chunk = chunks.find(c => c.pineconeId === match.id);
                if (chunk) {
                    return {
                        ...chunk.toObject(),
                        score: match.score
                    };
                }
                return null;
            }).filter(c => c !== null);

            // Sort by score (Pinecone already sorts, but ensure order)
            return scoredChunks.sort((a, b) => b.score - a.score).slice(0, limit);
        } catch (error) {
            console.error('Error searching chunks:', error);
            return [];
        }
    }
}

