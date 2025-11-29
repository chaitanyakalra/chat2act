import ApiIndex from '../models/ApiIndex.js';

/**
 * Check if a Zoho Org ID exists in the system
 * GET /api/org/check/:zohoOrgId
 */
export const checkOrgExists = async (req, res) => {
  try {
    const { zohoOrgId } = req.params;
    
    if (!zohoOrgId) {
      return res.status(400).json({
        success: false,
        message: 'zohoOrgId is required'
      });
    }
    
    console.log(`🔍 Checking if Zoho Org ID exists: ${zohoOrgId}`);
    
    // Check if any ApiIndex exists for this org
    const apiIndex = await ApiIndex.findOne({ zohoOrgId });
    
    if (!apiIndex) {
      console.log(`❌ Org not found: ${zohoOrgId}`);
      return res.json({
        success: true,
        exists: false,
        message: 'Organization not found. Please proceed with onboarding.'
      });
    }
    
    console.log(`✅ Org found: ${zohoOrgId}`);
    
    // Extract skills/endpoints for display
    const skills = apiIndex.endpoints.map(ep => ({
      method: ep.method,
      endpoint: ep.path,
      description: ep.summary || ep.description || '',
      parameters: ep.parameters || []
    }));
    
    return res.json({
      success: true,
      exists: true,
      data: {
        zohoOrgId: apiIndex.zohoOrgId,
        namespace: apiIndex.namespace,
        knowledgeBaseId: apiIndex._id,
        apiTitle: apiIndex.metadata?.title || 'API',
        apiDescription: apiIndex.metadata?.description || '',
        baseUrl: apiIndex.metadata?.baseUrl || '',
        totalEndpoints: apiIndex.endpoints.length,
        skills: skills,
        createdAt: apiIndex.createdAt,
        updatedAt: apiIndex.updatedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error checking org existence:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check organization',
      error: error.message
    });
  }
};
