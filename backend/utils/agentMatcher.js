import { analyzeQueryAuto } from '../services/llmService.js';
import { queryVectorAuto } from '../services/vectorService.js';

/**
 * Match user query to best endpoint using keyword matching (MOCK)
 * @param {string} query - User's natural language query
 * @param {Array} availableEndpoints - List of available endpoints
 * @returns {Promise<object>} - { endpoint, parameters, confidence }
 */
export const matchEndpointMock = async (query, availableEndpoints) => {
  console.log(`🤖 [MOCK] Matching query to endpoint: "${query}"`);
  
  const queryLower = query.toLowerCase();
  
  // Extract HTTP method intent
  let method = 'GET'; // default
  if (queryLower.includes('create') || queryLower.includes('add')) {
    method = 'POST';
  } else if (queryLower.includes('update') || queryLower.includes('edit')) {
    method = 'PUT';
  } else if (queryLower.includes('delete') || queryLower.includes('remove')) {
    method = 'DELETE';
  }
  
  // Extract resource and ID
  const resourcePatterns = {
    user: /user/i,
    order: /order/i,
    product: /product/i,
    customer: /customer/i,
    payment: /payment/i
  };
  
  let matchedResource = null;
  for (const [resource, pattern] of Object.entries(resourcePatterns)) {
    if (pattern.test(query)) {
      matchedResource = resource;
      break;
    }
  }
  
  // Extract ID (any number in the query)
  const idMatch = query.match(/\b(\d+)\b/);
  const extractedId = idMatch ? idMatch[1] : null;
  
  // Find matching endpoint
  let bestMatch = null;
  let bestScore = 0;
  
  for (const endpoint of availableEndpoints) {
    let score = 0;
    
    // Method match
    if (endpoint.method === method) {
      score += 0.4;
    }
    
    // Resource match
    if (matchedResource && endpoint.endpoint.toLowerCase().includes(matchedResource)) {
      score += 0.4;
    }
    
    // ID parameter match
    if (extractedId && endpoint.endpoint.includes('{id}')) {
      score += 0.2;
    } else if (!extractedId && !endpoint.endpoint.includes('{id}')) {
      score += 0.1;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = endpoint;
    }
  }
  
  // Extract parameters
  const parameters = {};
  if (extractedId && bestMatch && bestMatch.endpoint.includes('{id}')) {
    parameters.id = extractedId;
  }
  
  const result = {
    endpoint: bestMatch,
    parameters,
    confidence: bestScore,
    method: method
  };
  
  console.log(`✅ [MOCK] Matched endpoint:`, {
    endpoint: bestMatch?.endpoint,
    method: bestMatch?.method,
    confidence: bestScore
  });
  
  return result;
};

/**
 * Match user query to best endpoint using semantic search (PRODUCTION)
 * @param {string} query - User's natural language query
 * @param {Array} availableEndpoints - List of available endpoints
 * @param {string} namespace - Pinecone namespace
 * @returns {Promise<object>} - { endpoint, parameters, confidence }
 */
export const matchEndpointProduction = async (query, availableEndpoints, namespace = 'default') => {
  console.log(`🤖 [PROD] Matching query using semantic search: "${query}"`);
  
  try {
    // Step 1: Use LLM to analyze intent
    const intent = await analyzeQueryAuto(query, availableEndpoints);
    
    // Step 2: Query vector database for semantic similarity
    const vectorResults = await queryVectorAuto(query, 5, namespace);
    
    // Step 3: Combine LLM intent with vector search results
    let bestMatch = intent.matchedEndpoint;
    let confidence = intent.confidence;
    
    // If vector search found better matches, use those
    if (vectorResults.length > 0 && vectorResults[0].score > confidence) {
      const topResult = vectorResults[0];
      
      // Find the endpoint object from metadata
      bestMatch = availableEndpoints.find(ep => 
        ep.method === topResult.metadata.method && 
        ep.endpoint === topResult.metadata.endpoint
      );
      
      confidence = topResult.score;
    }
    
    const result = {
      endpoint: bestMatch,
      parameters: intent.parameters,
      confidence: confidence,
      method: bestMatch?.method || intent.action
    };
    
    console.log(`✅ [PROD] Matched endpoint:`, {
      endpoint: bestMatch?.endpoint,
      method: bestMatch?.method,
      confidence: confidence
    });
    
    return result;
  } catch (error) {
    console.error('❌ [PROD] Endpoint matching error:', error.message);
    throw error;
  }
};

/**
 * Auto-select mock or production matcher based on environment
 */
const USE_MOCK_MODE = process.env.USE_MOCK_MODE === 'true';
export const matchEndpointAuto = USE_MOCK_MODE ? matchEndpointMock : matchEndpointProduction;

console.log(`🚀 Agent Matcher initialized in ${USE_MOCK_MODE ? 'MOCK' : 'PRODUCTION'} mode`);
