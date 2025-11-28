import KnowledgeBase from '../models/KnowledgeBase.js';
import LearnedSkill from '../models/LearnedSkill.js';
import { parseAndExtract, endpointToText } from '../utils/openApiParser.js';
import { generateEmbeddingAuto, storeVectorAuto } from '../services/vectorService.js';

/**
 * Ingest API documentation from URL or file
 * POST /api/knowledge/ingest
 */
export const ingestKnowledge = async (req, res) => {
  try {
    const { sourceType, sourceUrl, fileContent, fileName } = req.body;
    
    if (!sourceType || (sourceType === 'url' && !sourceUrl) || (sourceType === 'file' && !fileContent)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: sourceType and sourceUrl/fileContent'
      });
    }
    
    console.log(`📥 Ingesting knowledge from ${sourceType}: ${sourceUrl || fileName}`);
    
    // Step 1: Parse OpenAPI specification
    const source = sourceType === 'url' ? sourceUrl : fileContent;
    const { spec, endpoints, validation } = await parseAndExtract(source, sourceType);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OpenAPI specification',
        errors: validation.errors
      });
    }
    
    // Step 2: Create KnowledgeBase document
    const knowledgeBase = await KnowledgeBase.create({
      sourceUrl: sourceUrl || null,
      sourceType,
      fileName: fileName || null,
      rawContent: JSON.stringify(spec),
      parsedEndpoints: endpoints,
      status: 'processing'
    });
    
    console.log(`✅ Created KnowledgeBase document: ${knowledgeBase._id}`);
    
    // Step 3: Generate embeddings and store vectors (dual-mode)
    const namespace = `kb_${knowledgeBase._id}`;
    const learnedSkills = [];
    
    for (const endpoint of endpoints) {
      try {
        // Create searchable text representation
        const endpointText = endpointToText(endpoint);
        
        // Generate embedding
        const embedding = await generateEmbeddingAuto(endpointText);
        
        // Store vector (returns vector ID)
        const vectorId = await storeVectorAuto(embedding, {
          method: endpoint.method,
          endpoint: endpoint.endpoint,
          description: endpoint.description,
          knowledgeBaseId: knowledgeBase._id.toString()
        }, namespace);
        
        // Create LearnedSkill document
        const skill = await LearnedSkill.create({
          method: endpoint.method,
          endpoint: endpoint.endpoint,
          description: endpoint.description,
          parameters: endpoint.parameters,
          knowledgeBaseId: knowledgeBase._id,
          vectorId: vectorId
        });
        
        learnedSkills.push(skill);
      } catch (error) {
        console.error(`❌ Error processing endpoint ${endpoint.method} ${endpoint.endpoint}:`, error.message);
        // Continue with other endpoints
      }
    }
    
    // Step 4: Update KnowledgeBase status
    knowledgeBase.status = 'completed';
    knowledgeBase.pineconeNamespace = namespace;
    await knowledgeBase.save();
    
    console.log(`✅ Knowledge ingestion complete. Learned ${learnedSkills.length} skills.`);
    
    return res.json({
      success: true,
      message: 'Knowledge ingested successfully',
      data: {
        knowledgeBaseId: knowledgeBase._id,
        totalEndpoints: endpoints.length,
        learnedSkills: learnedSkills.length,
        namespace: namespace,
        skills: learnedSkills.map(s => ({
          method: s.method,
          endpoint: s.endpoint,
          description: s.description
        }))
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
    
    // Build query
    const query = knowledgeBaseId ? { knowledgeBaseId } : {};
    
    // Fetch skills
    const skills = await LearnedSkill.find(query)
      .populate('knowledgeBaseId', 'sourceUrl sourceType createdAt')
      .sort({ createdAt: -1 });
    
    console.log(`📋 Retrieved ${skills.length} learned skills`);
    
    return res.json({
      success: true,
      count: skills.length,
      data: skills.map(skill => ({
        id: skill._id,
        method: skill.method,
        endpoint: skill.endpoint,
        description: skill.description,
        parameters: skill.parameters,
        source: skill.knowledgeBaseId ? {
          id: skill.knowledgeBaseId._id,
          type: skill.knowledgeBaseId.sourceType,
          url: skill.knowledgeBaseId.sourceUrl
        } : null,
        createdAt: skill.createdAt
      }))
    });
    
  } catch (error) {
    console.error('❌ Error fetching learned skills:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch learned skills',
      error: error.message
    });
  }
};
