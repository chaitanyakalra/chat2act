import { ProcessingPipeline } from '../services/processingPipeline.js';
import ApiIndex from '../models/ApiIndex.js';

/**
 * Ingest API documentation from URL or file
 * POST /api/knowledge/ingest
 */
export const ingestKnowledge = async (req, res) => {
  try {
    const { sourceType, sourceUrl, fileContent, fileName, baseUrlOverride } = req.body;
    
    if (!sourceType || (sourceType === 'url' && !sourceUrl) || (sourceType === 'file' && !fileContent)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sourceType and sourceUrl/fileContent'
      });
    }
    
    console.log(`📥 Ingesting knowledge from ${sourceType}: ${sourceUrl || fileName}`);
    if (baseUrlOverride) {
      console.log(`🌐 Base URL override provided: ${baseUrlOverride}`);
    }
    
    // Prepare raw text based on source type
    let rawText;
    let mimeType = 'application/json'; // Default
    
    if (sourceType === 'url') {
      // Fetch from URL
      const response = await fetch(sourceUrl);
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
    const result = await pipeline.process(tempDocId, rawText, mimeType, baseUrlOverride);
    
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
