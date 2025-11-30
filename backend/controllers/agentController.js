import ApiIndex from '../models/ApiIndex.js';
import { matchEndpointAuto } from '../utils/agentMatcher.js';
import { getDecryptedAuthConfig } from './authController.js';
import { generateResponse } from '../services/llmService.js';
import axios from 'axios';

/**
 * Execute agent query - match to endpoint and execute API call
 * POST /api/agent/execute
 */
export const executeAgent = async (req, res) => {
  try {
    const { userQuery, knowledgeBaseId, zohoOrgId } = req.body;
    
    if (!userQuery) {
      return res.status(400).json({
        success: false,
        message: 'userQuery is required'
      });
    }
    
    console.log(`🤖 Agent executing query: "${userQuery}"`);
    console.log(`📋 Knowledge Base ID: ${knowledgeBaseId || 'NOT PROVIDED - will use all endpoints'}`);
    if (zohoOrgId) {
      console.log(`🏢 Zoho Org ID: ${zohoOrgId}`);
    }
    
    // Step 1: Get available endpoints from ApiIndex
    let availableEndpoints = [];
    let baseUrl = null; // Store base URL for API calls
    
    if (knowledgeBaseId) {
      // Get specific API index
      const query = { _id: knowledgeBaseId };
      if (zohoOrgId) {
        query.zohoOrgId = zohoOrgId; // Filter by org for security
      }
      
      const apiIndex = await ApiIndex.findOne(query);
      if (apiIndex) {
        // Extract base URL from metadata
        console.log("apiIndex" , apiIndex.metadata);
        baseUrl = apiIndex.metadata?.baseUrl || null;
        console.log("metadata : ", baseUrl);
        // Transform ApiIndex endpoints to match expected format
        availableEndpoints = apiIndex.endpoints.map(ep => ({
          method: ep.method,
          endpoint: ep.path,
          description: ep.summary || ep.description || '',
          parameters: ep.parameters || []
        }));
      }
    } else {
      // Get all API indexes
      const apiIndexes = await ApiIndex.find();
      apiIndexes.forEach(apiIndex => {
        apiIndex.endpoints.forEach(ep => {
          availableEndpoints.push({
            method: ep.method,
            endpoint: ep.path,
            description: ep.summary || ep.description || '',
            parameters: ep.parameters || []
          });
        });
      });
    }
    
    if (availableEndpoints.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No learned skills found. Please ingest API documentation first.'
      });
    }
    
    console.log(`📋 Found ${availableEndpoints.length} available endpoints`);
    
    // Step 2: Match query to best endpoint
    const match = await matchEndpointAuto(userQuery, availableEndpoints);
    
    if (!match.endpoint) {
      return res.status(404).json({
        success: false,
        message: 'Could not match query to any available endpoint',
        confidence: match.confidence
      });
    }
    
    console.log(`✅ Matched to: ${match.endpoint.method} ${match.endpoint.endpoint} (confidence: ${match.confidence})`);
    
    // Step 3: Get authentication configuration
    const authConfig = await getDecryptedAuthConfig(zohoOrgId);
    
    // Step 4: Execute API call (MOCK MODE - return mock data)
    const USE_MOCK_MODE = process.env.USE_MOCK_MODE === 'true';
    
    let apiResponse;
    let executionDetails;
    
    if (USE_MOCK_MODE) {
      // Mock execution
      console.log(`🔄 [MOCK] Simulating API call...`);
      
      // Replace path parameters
      let finalEndpoint = match.endpoint.endpoint;
      if (match.parameters) {
        Object.entries(match.parameters).forEach(([key, value]) => {
          finalEndpoint = finalEndpoint.replace(`{${key}}`, value);
        });
      }
      
      // Generate mock response based on endpoint
      apiResponse = generateMockResponse(match.endpoint, match.parameters);
      
      executionDetails = {
        mode: 'mock',
        endpoint: finalEndpoint,
        method: match.endpoint.method,
        parameters: match.parameters,
        authUsed: authConfig ? authConfig.authType : 'none'
      };
      
      console.log(`✅ [MOCK] Execution complete`);
    } else {
      // Production execution - make real API call
      console.log(`🔄 [PROD] Making real API call...`);
      
      try {
        console.log("agentController: ", match);
        const result = await executeRealApiCall(
          match.endpoint,
          match.parameters,
          authConfig,
          baseUrl  // Pass base URL
        );
        
        apiResponse = result.data;
        executionDetails = {
          mode: 'production',
          endpoint: result.url,
          method: match.endpoint.method,
          parameters: match.parameters,
          authUsed: authConfig ? authConfig.authType : 'none',
          statusCode: result.status
        };
        
        console.log(`✅ [PROD] API call successful (${result.status})`);
      } catch (error) {
        console.error(`❌ [PROD] API call failed:`, error.message);
        return res.status(500).json({
          success: false,
          message: 'API call execution failed',
          error: error.message,
          endpoint: match.endpoint
        });
      }
    }
    
    // Step 5: Generate natural language response (optional)
    let naturalResponse = null;
    try {
      naturalResponse = await generateResponse(userQuery, apiResponse, match.endpoint);
    } catch (error) {
      console.log('⚠️  Could not generate natural language response');
    }
    
    return res.json({
      success: true,
      data: {
        query: userQuery,
        matchedEndpoint: {
          method: match.endpoint.method,
          endpoint: match.endpoint.endpoint,
          description: match.endpoint.description,
          confidence: match.confidence
        },
        toolCall: {
          method: match.endpoint.method,
          endpoint: executionDetails.endpoint,
          parameters: match.parameters
        },
        response: apiResponse,
        naturalResponse: naturalResponse,
        executionDetails: executionDetails
      }
    });
    
  } catch (error) {
    console.error('❌ Agent execution error:', error);
    return res.status(500).json({
      success: false,
      message: 'Agent execution failed',
      error: error.message
    });
  }
};

/**
 * Generate mock API response based on endpoint
 */
function generateMockResponse(endpoint, parameters) {
  const method = endpoint.method;
  const path = endpoint.endpoint;
  
  // Mock responses based on common patterns
  if (method === 'GET' && path.includes('{id}')) {
    return {
      id: parameters.id || 123,
      name: 'John Doe',
      email: 'john.doe@example.com',
      role: 'admin',
      createdAt: new Date().toISOString()
    };
  } else if (method === 'GET' && path.includes('users')) {
    return [
      { id: 1, name: 'John Doe', email: 'john@example.com' },
      { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
    ];
  } else if (method === 'POST') {
    return {
      id: Math.floor(Math.random() * 1000),
      message: 'Resource created successfully',
      createdAt: new Date().toISOString()
    };
  } else if (method === 'PUT' || method === 'PATCH') {
    return {
      id: parameters.id || 123,
      message: 'Resource updated successfully',
      updatedAt: new Date().toISOString()
    };
  } else if (method === 'DELETE') {
    return {
      message: 'Resource deleted successfully',
      deletedAt: new Date().toISOString()
    };
  }
  
  return { message: 'Operation completed successfully' };
}

/**
 * Execute real API call with authentication (PRODUCTION)
 */
async function executeRealApiCall(endpoint, parameters, authConfig, baseUrl) {
  // Build full URL with base URL
  let path = endpoint.endpoint;
  console.log("baseurl: ", baseUrl);
  // Replace path parameters
  if (parameters) {
    Object.entries(parameters).forEach(([key, value]) => {
      path = path.replace(`{${key}}`, value);
    });
  }
  
  // Construct full URL
  let url;
  if (baseUrl) {
    // Remove trailing slash from baseUrl and leading slash from path
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanPath = path.replace(/^\//, '');
    url = `${cleanBaseUrl}/${cleanPath}`;
    console.log(`🌐 Base URL: ${baseUrl}`);
    console.log(`🌐 Full URL: ${url}`);
  } else {
    url = path;
    console.log(`⚠️  No base URL provided, using path only: ${url}`);
  }
  
  // Prepare request config
  const requestConfig = {
    method: endpoint.method,
    url: url,
    headers: {}
  };
  
  // Add authentication
  if (authConfig) {
    switch (authConfig.authType) {
      case 'apiKey':
        requestConfig.headers[authConfig.config.keyName] = authConfig.config.keyValue;
        break;
      
      case 'bearer':
        requestConfig.headers['Authorization'] = `Bearer ${authConfig.config.token}`;
        break;
      
      case 'basic':
        const credentials = Buffer.from(
          `${authConfig.config.username}:${authConfig.config.password}`
        ).toString('base64');
        requestConfig.headers['Authorization'] = `Basic ${credentials}`;
        break;
      
      case 'custom':
        requestConfig.headers[authConfig.config.headerName] = authConfig.config.headerValue;
        break;
      
      case 'oauth2':
        // For OAuth2, assume token is already obtained and stored
        if (authConfig.config.accessToken) {
          requestConfig.headers['Authorization'] = `Bearer ${authConfig.config.accessToken}`;
        }
        break;
    }
  }
  
  // Execute request
  const response = await axios(requestConfig);
  
  return {
    data: response.data,
    status: response.status,
    url: url
  };
}
