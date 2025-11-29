import { ProcessingPipeline } from '../services/processingPipeline.js';
import { ApiParserService } from '../services/apiParserService.js';
import ApiIndex from '../models/ApiIndex.js';
import crypto from 'crypto';

// Simple in-memory cache for analysis results (TTL: 10 minutes)
const analysisCache = new Map();

// Clean up old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of analysisCache.entries()) {
    if (now > value.expiry) {
      analysisCache.delete(key);
    }
  }
}, 60000); // Check every minute

/**
 * Ingest API documentation from URL or file
 * POST /api/knowledge/ingest
 */
export const ingestKnowledge = async (req, res) => {
  try {
    const { sourceType, sourceUrl, fileContent, fileName, baseUrlOverride, zohoOrgId, organizationName, authConfig, analysisId } = req.body;
    
    if (!analysisId && (!sourceType || (sourceType === 'url' && !sourceUrl) || (sourceType === 'file' && !fileContent))) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sourceType and sourceUrl/fileContent'
      });
    }
    
    // Validate zohoOrgId is provided
    if (!zohoOrgId) {
      return res.status(400).json({
        success: false,
        message: 'zohoOrgId is required for multi-tenancy support'
      });
    }
    
    console.log(`📥 Ingesting knowledge from ${sourceType}: ${sourceUrl || fileName}`);
    console.log(`🏢 Zoho Org ID: ${zohoOrgId}`);
    if (baseUrlOverride) {
      console.log(`🌐 Base URL override provided: ${baseUrlOverride}`);
    }
    
    // Prepare raw text based on source type
    let rawText;
    let mimeType = 'application/json'; // Default
    
    // Check cache first if analysisId provided
    if (analysisId && analysisCache.has(analysisId)) {
      console.log(`⚡ Using cached analysis data for ID: ${analysisId}`);
      const cached = analysisCache.get(analysisId);
      rawText = cached.rawText;
      mimeType = cached.mimeType;
    } else if (sourceType === 'url') {
      // Fetch from URL
      // Fetch from URL with optional authentication
      const headers = {};
      
      if (authConfig) {
        if (authConfig.type === 'bearer' && authConfig.token) {
          headers['Authorization'] = `Bearer ${authConfig.token}`;
        } else if (authConfig.type === 'basic' && authConfig.username && authConfig.password) {
          const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        } else if (authConfig.type === 'apiKey' && authConfig.location === 'header' && authConfig.keyName && authConfig.keyValue) {
          headers[authConfig.keyName] = authConfig.keyValue;
        } else if (authConfig.type === 'custom' && authConfig.headerName && authConfig.headerValue) {
          headers[authConfig.headerName] = authConfig.headerValue;
        } else if (authConfig.type === 'oauth2' && authConfig.clientId && authConfig.clientSecret && authConfig.tokenUrl) {
          try {
            console.log(`🔑 Fetching OAuth2 token from ${authConfig.tokenUrl}`);
            
            const bodyParams = new URLSearchParams();
            bodyParams.append('grant_type', 'client_credentials');
            
            const requestHeaders = {
              'Content-Type': 'application/x-www-form-urlencoded'
            };

            // Check client authentication method (header vs body)
            if (authConfig.clientAuthentication === 'body') {
              console.log('📝 Sending client credentials in body');
              bodyParams.append('client_id', authConfig.clientId);
              bodyParams.append('client_secret', authConfig.clientSecret);
            } else {
              // Default to Basic Auth header
              console.log('📝 Sending client credentials in header');
              requestHeaders['Authorization'] = `Basic ${Buffer.from(`${authConfig.clientId}:${authConfig.clientSecret}`).toString('base64')}`;
            }

            const tokenResponse = await fetch(authConfig.tokenUrl, {
              method: 'POST',
              headers: requestHeaders,
              body: bodyParams.toString()
            });
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              if (tokenData.access_token) {
                headers['Authorization'] = `Bearer ${tokenData.access_token}`;
                console.log('✅ OAuth2 token obtained successfully');
              }
            } else {
              console.error('❌ Failed to fetch OAuth2 token:', await tokenResponse.text());
            }
          } catch (error) {
            console.error('❌ OAuth2 token fetch error:', error);
          }
        }
      }
      
      const response = await fetch(sourceUrl, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch from URL: ${response.statusText}`);
      }
      rawText = await response.text();
      
      // Detect YAML vs JSON
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('yaml') || sourceUrl.endsWith('.yaml') || sourceUrl.endsWith('.yml')) {
        mimeType = 'application/x-yaml';
      }
    } else {
      // Use file content
      rawText = fileContent;
      
      // Detect YAML vs JSON from filename
      if (fileName?.endsWith('.yaml') || fileName?.endsWith('.yml')) {
        mimeType = 'application/x-yaml';
      }
    }
    
    // Create a temporary API doc ID (we'll use the ApiIndex ID later)
    const tempDocId = `temp_${Date.now()}`;
    
    // Use ProcessingPipeline for advanced processing
    const pipeline = new ProcessingPipeline();
    const result = await pipeline.process(tempDocId, rawText, mimeType, baseUrlOverride, zohoOrgId, organizationName);
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Processing failed',
        error: result.error
      });
    }
    
    // Get the created ApiIndex to extract endpoints for frontend
    const apiIndex = await ApiIndex.findById(result.apiIndexId);
    
    // Update ApiIndex with source information
    apiIndex.sourceUrl = sourceUrl || null;
    apiIndex.sourceType = sourceType;
    apiIndex.fileName = fileName || null;
    await apiIndex.save();
    
    console.log(`✅ Knowledge ingestion complete via ProcessingPipeline`);
    console.log(`   - Endpoints: ${result.stats.endpoints}`);
    console.log(`   - Intents: ${result.stats.intents}`);
    console.log(`   - Sub-intents: ${result.stats.subIntents}`);
    console.log(`   - Vector chunks: ${result.stats.vectorChunks}`);
    
    // Format skills for frontend (simplified view)
    const skills = apiIndex.endpoints.map(ep => ({
      method: ep.method,
      endpoint: ep.path,
      description: ep.summary || ep.description || '',
      parameters: ep.parameters || []
    }));
    
    return res.json({
      success: true,
      message: 'Knowledge ingested successfully with advanced processing',
      data: {
        knowledgeBaseId: result.apiIndexId,
        totalEndpoints: result.stats.endpoints,
        learnedSkills: result.stats.endpoints,
        vectorChunks: result.stats.vectorChunks,
        intents: result.stats.intents,
        subIntents: result.stats.subIntents,
        skills: skills
      }
    });
    
  } catch (error) {
    console.error('❌ Knowledge ingestion error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to ingest knowledge',
      error: error.message
    });
  }
};

/**
 * Analyze API documentation without ingesting
 * POST /api/knowledge/analyze
 */
export const analyzeKnowledge = async (req, res) => {
  try {
    const { sourceType, sourceUrl, fileContent, fileName, authConfig } = req.body;
    
    if (!sourceType || (sourceType === 'url' && !sourceUrl) || (sourceType === 'file' && !fileContent)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sourceType and sourceUrl/fileContent'
      });
    }
    
    console.log(`🔍 Analyzing knowledge from ${sourceType}: ${sourceUrl || fileName}`);
    
    // Prepare raw text based on source type
    let rawText;
    let mimeType = 'application/json'; // Default
    
    if (sourceType === 'url') {
      // Fetch from URL with optional authentication
      const headers = {};
      
      if (authConfig) {
        if (authConfig.type === 'bearer' && authConfig.token) {
          headers['Authorization'] = `Bearer ${authConfig.token}`;
        } else if (authConfig.type === 'basic' && authConfig.username && authConfig.password) {
          const credentials = Buffer.from(`${authConfig.username}:${authConfig.password}`).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        } else if (authConfig.type === 'apiKey' && authConfig.location === 'header' && authConfig.keyName && authConfig.keyValue) {
          headers[authConfig.keyName] = authConfig.keyValue;
        } else if (authConfig.type === 'custom' && authConfig.headerName && authConfig.headerValue) {
          headers[authConfig.headerName] = authConfig.headerValue;
        } else if (authConfig.type === 'oauth2' && authConfig.clientId && authConfig.clientSecret && authConfig.tokenUrl) {
          try {
            console.log(`🔑 Fetching OAuth2 token from ${authConfig.tokenUrl}`);
            
            const bodyParams = new URLSearchParams();
            bodyParams.append('grant_type', 'client_credentials');
            
            const requestHeaders = {
              'Content-Type': 'application/x-www-form-urlencoded'
            };

            // Check client authentication method (header vs body)
            if (authConfig.clientAuthentication === 'body') {
              bodyParams.append('client_id', authConfig.clientId);
              bodyParams.append('client_secret', authConfig.clientSecret);
            } else {
              requestHeaders['Authorization'] = `Basic ${Buffer.from(`${authConfig.clientId}:${authConfig.clientSecret}`).toString('base64')}`;
            }

            const tokenResponse = await fetch(authConfig.tokenUrl, {
              method: 'POST',
              headers: requestHeaders,
              body: bodyParams.toString()
            });
            
            if (tokenResponse.ok) {
              const tokenData = await tokenResponse.json();
              if (tokenData.access_token) {
                headers['Authorization'] = `Bearer ${tokenData.access_token}`;
              }
            } else {
              console.error('❌ Failed to fetch OAuth2 token:', await tokenResponse.text());
            }
          } catch (error) {
            console.error('❌ OAuth2 token fetch error:', error);
          }
        }
      }
      
      const response = await fetch(sourceUrl, { headers });
      if (!response.ok) {
        throw new Error(`Failed to fetch from URL: ${response.statusText}`);
      }
      rawText = await response.text();
      
      // Detect YAML vs JSON
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('yaml') || sourceUrl.endsWith('.yaml') || sourceUrl.endsWith('.yml')) {
        mimeType = 'application/x-yaml';
      }
    } else {
      // Use file content
      rawText = fileContent;
      
      // Detect YAML vs JSON from filename
      if (fileName?.endsWith('.yaml') || fileName?.endsWith('.yml')) {
        mimeType = 'application/x-yaml';
      }
    }
    
    // Parse the documentation
    const parsed = await ApiParserService.parse(rawText, mimeType);
    
    // Cache the result
    const analysisId = crypto.randomUUID();
    analysisCache.set(analysisId, {
      rawText,
      mimeType,
      parsed, // Store parsed result too if we want to use it later
      expiry: Date.now() + 10 * 60 * 1000 // 10 minutes TTL
    });
    
    return res.json({
      success: true,
      message: 'Analysis complete',
      data: {
        analysisId, // Return ID to frontend
        metadata: parsed.metadata,
        stats: {
          endpoints: parsed.endpoints.length,
          components: Object.keys(parsed.components || {}).length
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Knowledge analysis error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to analyze knowledge',
      error: error.message
    });
  }
};

/**
 * Get all learned skills/endpoints
 * GET /api/skills
 */
export const getLearnedSkills = async (req, res) => {
  try {
    const { knowledgeBaseId } = req.query;
    
    if (knowledgeBaseId) {
      // Get specific API index
      const apiIndex = await ApiIndex.findById(knowledgeBaseId);
      
      if (!apiIndex) {
        return res.status(404).json({
          success: false,
          message: 'Knowledge base not found'
        });
      }
      
      const skills = apiIndex.endpoints.map(ep => ({
        method: ep.method,
        endpoint: ep.path,
        description: ep.summary || ep.description || '',
        parameters: ep.parameters || [],
        tags: ep.businessTags || ep.tags || []
      }));
      
      return res.json({
        success: true,
        count: skills.length,
        data: skills
      });
    } else {
      // Get all API indexes
      const apiIndexes = await ApiIndex.find().sort({ createdAt: -1 });
      
      const allSkills = [];
      apiIndexes.forEach(apiIndex => {
        apiIndex.endpoints.forEach(ep => {
          allSkills.push({
            method: ep.method,
            endpoint: ep.path,
            description: ep.summary || ep.description || '',
            parameters: ep.parameters || [],
            tags: ep.businessTags || ep.tags || [],
            source: {
              id: apiIndex._id,
              type: apiIndex.sourceType,
              url: apiIndex.sourceUrl
            }
          });
        });
      });
      
      return res.json({
        success: true,
        count: allSkills.length,
        data: allSkills
      });
    }
    
  } catch (error) {
    console.error('❌ Error fetching learned skills:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch learned skills',
      error: error.message
    });
  }
};
