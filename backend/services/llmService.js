import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const USE_MOCK_MODE = process.env.USE_MOCK_MODE === 'true';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Determine which LLM provider to use
let LLM_PROVIDER = 'none';
if (!USE_MOCK_MODE) {
  if (GEMINI_API_KEY) {
    LLM_PROVIDER = 'gemini';
  } else if (OPENAI_API_KEY) {
    LLM_PROVIDER = 'openai';
  }
}

// Initialize clients (only in production mode)
let openai = null;
let gemini = null;

if (!USE_MOCK_MODE) {
  if (LLM_PROVIDER === 'openai') {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    console.log('🤖 Using OpenAI GPT-4 for LLM');
  } else if (LLM_PROVIDER === 'gemini') {
    gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('🤖 Using Google Gemini for LLM');
  } else {
    console.warn('⚠️  No LLM API key set (OPENAI_API_KEY or GEMINI_API_KEY). LLM service will fail in production mode.');
  }
}

// ============================================
// MOCK IMPLEMENTATION
// ============================================

/**
 * Analyze user query using simple keyword matching (mock)
 * @param {string} query - User's natural language query
 * @param {Array} availableEndpoints - List of available API endpoints
 * @returns {Promise<object>} - Intent object with matched endpoint and parameters
 */
export const analyzeQueryMock = async (query, availableEndpoints = []) => {
  console.log(`🤖 [MOCK] Analyzing query: "${query}"`);
  
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const queryLower = query.toLowerCase();
  
  // Simple keyword extraction
  const keywords = {
    action: null,
    resource: null,
    id: null
  };
  
  // Extract action
  if (queryLower.includes('get') || queryLower.includes('find') || queryLower.includes('show') || queryLower.includes('retrieve')) {
    keywords.action = 'GET';
  } else if (queryLower.includes('create') || queryLower.includes('add') || queryLower.includes('new')) {
    keywords.action = 'POST';
  } else if (queryLower.includes('update') || queryLower.includes('edit') || queryLower.includes('modify')) {
    keywords.action = 'PUT';
  } else if (queryLower.includes('delete') || queryLower.includes('remove')) {
    keywords.action = 'DELETE';
  }
  
  // Extract resource
  if (queryLower.includes('user')) {
    keywords.resource = 'user';
  } else if (queryLower.includes('order')) {
    keywords.resource = 'order';
  } else if (queryLower.includes('product')) {
    keywords.resource = 'product';
  } else if (queryLower.includes('customer')) {
    keywords.resource = 'customer';
  }
  
  // Extract ID (look for numbers)
  const idMatch = query.match(/\b(\d+)\b/);
  if (idMatch) {
    keywords.id = idMatch[1];
  }
  
  // Try to match to an endpoint
  let matchedEndpoint = null;
  
  if (availableEndpoints.length > 0) {
    // Find best matching endpoint
    for (const endpoint of availableEndpoints) {
      const methodMatch = !keywords.action || endpoint.method === keywords.action;
      const resourceMatch = !keywords.resource || 
        endpoint.endpoint.toLowerCase().includes(keywords.resource);
      const idMatch = !keywords.id || endpoint.endpoint.includes('{id}');
      
      if (methodMatch && resourceMatch) {
        matchedEndpoint = endpoint;
        break;
      }
    }
  }
  
  // Build intent object
  const intent = {
    action: keywords.action || 'GET',
    resource: keywords.resource || 'unknown',
    parameters: {},
    matchedEndpoint: matchedEndpoint,
    confidence: matchedEndpoint ? 0.85 : 0.50
  };
  
  if (keywords.id && matchedEndpoint) {
    intent.parameters.id = keywords.id;
  }
  
  console.log(`✅ [MOCK] Intent extracted:`, intent);
  return intent;
};

// ============================================
// PRODUCTION IMPLEMENTATION
// ============================================

/**
 * Analyze user query using LLM (OpenAI or Gemini)
 * @param {string} query - User's natural language query
 * @param {Array} availableEndpoints - List of available API endpoints
 * @returns {Promise<object>} - Intent object with matched endpoint and parameters
 */
export const analyzeQuery = async (query, availableEndpoints = []) => {
  if (LLM_PROVIDER === 'none') {
    throw new Error('No LLM provider configured. Set OPENAI_API_KEY or GEMINI_API_KEY.');
  }
  
  console.log(`🤖 [PROD] Analyzing query with ${LLM_PROVIDER.toUpperCase()}: "${query}"`);
  
  try {
    // Prepare endpoint context
    const endpointContext = availableEndpoints.map(ep => 
      `${ep.method} ${ep.endpoint} - ${ep.description}`
    ).join('\n');
    
    const systemPrompt = `You are an API intent analyzer. Given a user's natural language query and a list of available API endpoints, determine:
1. Which endpoint best matches the user's intent
2. What HTTP method should be used
3. What parameters are needed
4. Extract parameter values from the query

Available endpoints:
${endpointContext}

Respond with a JSON object containing:
- endpoint: the matched endpoint path
- method: HTTP method
- parameters: object with parameter names and values
- confidence: 0-1 score of match confidence`;

    let result;
    
    if (LLM_PROVIDER === 'openai') {
      // OpenAI implementation
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3
      });
      
      result = JSON.parse(response.choices[0].message.content);
      
    } else if (LLM_PROVIDER === 'gemini') {
      // Gemini implementation
      const model = gemini.getGenerativeModel({ 
        model: 'gemini-1.5-pro',
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json'
        }
      });
      
      const prompt = `${systemPrompt}\n\nUser query: ${query}`;
      const geminiResponse = await model.generateContent(prompt);
      const responseText = geminiResponse.response.text();
      
      result = JSON.parse(responseText);
    }
    
    // Find the matched endpoint object
    const matchedEndpoint = availableEndpoints.find(ep => 
      ep.endpoint === result.endpoint && ep.method === result.method
    );
    
    const intent = {
      action: result.method,
      resource: result.endpoint.split('/')[1] || 'unknown',
      parameters: result.parameters || {},
      matchedEndpoint: matchedEndpoint || null,
      confidence: result.confidence || 0.9
    };
    
    console.log(`✅ [PROD] Intent extracted:`, intent);
    return intent;
  } catch (error) {
    console.error(`❌ [PROD] ${LLM_PROVIDER.toUpperCase()} analysis error:`, error.message);
    throw error;
  }
};

/**
 * Generate a natural language response using LLM (OpenAI or Gemini)
 * @param {string} userQuery - Original user query
 * @param {object} apiResponse - API response data
 * @param {object} endpoint - Endpoint that was called
 * @returns {Promise<string>} - Natural language response
 */
export const generateResponse = async (userQuery, apiResponse, endpoint) => {
  if (LLM_PROVIDER === 'none') {
    // Mock response
    return `I executed ${endpoint.method} ${endpoint.endpoint} and received the response.`;
  }
  
  console.log(`🤖 [PROD] Generating natural language response with ${LLM_PROVIDER.toUpperCase()}`);
  
  try {
    const prompt = `User asked: "${userQuery}"\n\nI called ${endpoint.method} ${endpoint.endpoint} and got this response:\n${JSON.stringify(apiResponse, null, 2)}\n\nProvide a natural language summary.`;
    
    if (LLM_PROVIDER === 'openai') {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful API assistant. Convert API responses into natural, conversational language.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      });
      
      return response.choices[0].message.content;
      
    } else if (LLM_PROVIDER === 'gemini') {
      const model = gemini.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200
        }
      });
      
      const systemInstruction = 'You are a helpful API assistant. Convert API responses into natural, conversational language.';
      const geminiResponse = await model.generateContent(`${systemInstruction}\n\n${prompt}`);
      
      return geminiResponse.response.text();
    }
  } catch (error) {
    console.error(`❌ [PROD] Response generation error:`, error.message);
    return `I executed ${endpoint.method} ${endpoint.endpoint} successfully.`;
  }
};

// ============================================
// UNIFIED INTERFACE
// ============================================

export const analyzeQueryAuto = USE_MOCK_MODE ? analyzeQueryMock : analyzeQuery;

console.log(`🚀 LLM Service initialized in ${USE_MOCK_MODE ? 'MOCK' : 'PRODUCTION'} mode`);
