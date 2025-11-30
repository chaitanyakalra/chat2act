import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();

const USE_MOCK_MODE = process.env.USE_MOCK_MODE === 'true';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'api-endpoints';

// Determine which embedding provider to use
let EMBEDDING_PROVIDER = 'none';
if (!USE_MOCK_MODE) {
  if (GEMINI_API_KEY) {
    EMBEDDING_PROVIDER = 'gemini';
  } else if (OPENAI_API_KEY) {
    EMBEDDING_PROVIDER = 'openai';
  }
}

// Initialize clients (only in production mode)
let openai = null;
let gemini = null;
let pinecone = null;
let pineconeIndex = null;

if (!USE_MOCK_MODE) {
  if (EMBEDDING_PROVIDER === 'openai') {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log('🔢 Using OpenAI for embeddings');
  } else if (EMBEDDING_PROVIDER === 'gemini') {
    gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('🔢 Using Google Gemini for embeddings');
  } else {
    console.warn('⚠️  No embedding API key set (OPENAI_API_KEY or GEMINI_API_KEY). Vector service will fail in production mode.');
  }
  
  if (PINECONE_API_KEY) {
    pinecone = new Pinecone({ apiKey: PINECONE_API_KEY });
    pineconeIndex = pinecone.index(PINECONE_INDEX_NAME);
  } else {
    console.warn('⚠️  PINECONE_API_KEY not set. Vector storage will fail in production mode.');
  }
}

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * Generate mock embedding (random vector)
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<Array>} - Mock embedding vector (1536 dimensions)
 */
export const generateEmbeddingMock = async (text) => {
  console.log(`🔄 [MOCK] Generating embedding for: "${text.substring(0, 50)}..."`);
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Generate random 1536-dimensional vector (OpenAI embedding size)
  const mockVector = Array.from({ length: 1536 }, () => Math.random() - 0.5);
  
  console.log(`✅ [MOCK] Generated ${mockVector.length}-dimensional vector`);
  return mockVector;
};

/**
 * Store mock vector (just log)
 * @param {Array} vector - Embedding vector
 * @param {object} metadata - Metadata to store with vector
 * @returns {Promise<string>} - Mock vector ID
 */
export const storeVectorMock = async (vector, metadata) => {
  console.log(`🔄 [MOCK] Storing vector with metadata:`, {
    dimensions: vector.length,
    metadata: metadata
  });
  
  // Simulate storage delay
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Generate mock ID
  const mockId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`✅ [MOCK] Vector stored with ID: ${mockId}`);
  return mockId;
};

/**
 * Query mock vectors (return mock results)
 * @param {string} queryText - Query text
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} - Mock search results
 */
export const queryVectorMock = async (queryText, topK = 5) => {
  console.log(`🔄 [MOCK] Querying vectors for: "${queryText}"`);
  
  // Simulate query delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Return mock results
  const mockResults = [
    {
      id: 'mock_vector_1',
      score: 0.95,
      metadata: {
        method: 'GET',
        endpoint: '/users/{id}',
        description: 'Get user by ID'
      }
    },
    {
      id: 'mock_vector_2',
      score: 0.87,
      metadata: {
        method: 'GET',
        endpoint: '/users',
        description: 'List all users'
      }
    }
  ];
  
  console.log(`✅ [MOCK] Found ${mockResults.length} results`);
  return mockResults.slice(0, topK);
};

// ============================================
// PRODUCTION IMPLEMENTATIONS
// ============================================

/**
 * Generate real embedding using OpenAI or Gemini
 * @param {string} text - Text to generate embedding for
 * @returns {Promise<Array>} - Embedding vector
 */
export const generateEmbedding = async (text) => {
  if (EMBEDDING_PROVIDER === 'none') {
    throw new Error('No embedding provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY.');
  }
  
  console.log(`🔄 [PROD] Generating embedding with ${EMBEDDING_PROVIDER.toUpperCase()} for: "${text.substring(0, 50)}..."`);
  
  try {
    let vector;
    
    if (EMBEDDING_PROVIDER === 'openai') {
      // OpenAI embeddings
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float'
      });
      
      vector = response.data[0].embedding;
      
    } else if (EMBEDDING_PROVIDER === 'gemini') {
      // Gemini embeddings
      const model = gemini.getGenerativeModel({ model: 'text-embedding-004' });
      const result = await model.embedContent(text);
      
      vector = result.embedding.values;
    }
    
    console.log(`✅ [PROD] Generated ${vector.length}-dimensional embedding`);
    return vector;
    
  } catch (error) {
    console.error(`❌ [PROD] ${EMBEDDING_PROVIDER.toUpperCase()} embedding error:`, error.message);
    throw error;
  }
};

/**
 * Store vector in Pinecone
 * @param {Array} vector - Embedding vector
 * @param {object} metadata - Metadata to store with vector
 * @param {string} namespace - Pinecone namespace (optional)
 * @returns {Promise<string>} - Vector ID
 */
export const storeVector = async (vector, metadata, namespace = 'default') => {
  if (!pineconeIndex) {
    throw new Error('Pinecone client not initialized. Check PINECONE_API_KEY.');
  }
  
  console.log(`🔄 [PROD] Storing vector in Pinecone namespace: ${namespace}`);
  
  try {
    // Generate unique ID
    const vectorId = `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Upsert to Pinecone
    await pineconeIndex.namespace(namespace).upsert([
      {
        id: vectorId,
        values: vector,
        metadata: metadata
      }
    ]);
    
    console.log(`✅ [PROD] Vector stored with ID: ${vectorId}`);
    return vectorId;
  } catch (error) {
    console.error('❌ [PROD] Pinecone storage error:', error.message);
    throw error;
  }
};

/**
 * Query Pinecone for similar vectors
 * @param {string} queryText - Query text
 * @param {number} topK - Number of results to return
 * @param {string} namespace - Pinecone namespace (optional)
 * @returns {Promise<Array>} - Search results
 */
export const queryVector = async (queryText, topK = 5, namespace = 'default') => {
  if (!pineconeIndex) {
    throw new Error('Pinecone client not initialized. Check PINECONE_API_KEY.');
  }
  
  if (EMBEDDING_PROVIDER === 'none') {
    throw new Error('No embedding provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY.');
  }
  
  console.log(`🔄 [PROD] Querying Pinecone for semantic match: "${queryText}"`);
  
  try {
    // First, generate embedding for query
    const queryVector = await generateEmbedding(queryText);
    
    // Query Pinecone
    const results = await pineconeIndex.namespace(namespace).query({
      vector: queryVector,
      topK: topK,
      includeMetadata: true
    });
    
    console.log(`✅ [PROD] Found ${results.matches.length} matches`);
    
    return results.matches.map(match => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata
    }));
  } catch (error) {
    console.error('❌ [PROD] Pinecone query error:', error.message);
    throw error;
  }
};

// ============================================
// UNIFIED INTERFACE (Auto-selects mock or production)
// ============================================

export const generateEmbeddingAuto = USE_MOCK_MODE ? generateEmbeddingMock : generateEmbedding;
export const storeVectorAuto = USE_MOCK_MODE ? storeVectorMock : storeVector;
export const queryVectorAuto = USE_MOCK_MODE ? queryVectorMock : queryVector;

console.log(`🚀 Vector Service initialized in ${USE_MOCK_MODE ? 'MOCK' : 'PRODUCTION'} mode`);
