import AuthConfig from '../models/AuthConfig.js';
import { encryptConfig, decryptConfig } from '../utils/encryption.js';

// Define sensitive fields for each auth type
const SENSITIVE_FIELDS = {
  oauth2: ['clientSecret'],
  apiKey: ['keyValue'],
  bearer: ['token'],
  basic: ['password'],
  custom: ['headerValue']
};

/**
 * Configure authentication settings (with encryption)
 * POST /api/auth/configure
 */
export const configureAuth = async (req, res) => {
  try {
    const { authEnabled, authType, config, zohoOrgId } = req.body;
    
    if (!zohoOrgId) {
      return res.status(400).json({
        success: false,
        message: 'zohoOrgId is required'
      });
    }
    
    if (authEnabled && !authType) {
      return res.status(400).json({
        success: false,
        message: 'authType is required when authEnabled is true'
      });
    }
    
    if (authEnabled && !config) {
      return res.status(400).json({
        success: false,
        message: 'config is required when authEnabled is true'
      });
    }
    
    console.log(`🔐 Configuring authentication: ${authEnabled ? authType : 'disabled'}`);
    
    let encryptedData = { encryptedConfig: {}, ivs: {}, tags: {} };
    
    if (authEnabled && config) {
      // Get sensitive fields for this auth type
      const sensitiveFields = SENSITIVE_FIELDS[authType] || [];
      
      // Encrypt sensitive fields
      encryptedData = encryptConfig(config, sensitiveFields);
      
      console.log(`🔒 Encrypted ${sensitiveFields.length} sensitive fields`);
    }
    
    // Delete existing config for this org and create new one
    await AuthConfig.deleteMany({ zohoOrgId });
    
    const authConfig = await AuthConfig.create({
      zohoOrgId,
      authEnabled,
      authType: authEnabled ? authType : null,
      encryptedConfig: encryptedData.encryptedConfig,
      ivs: encryptedData.ivs || {},
      tags: encryptedData.tags || {}
    });
    
    console.log(`✅ Auth configuration saved: ${authConfig._id}`);
    
    return res.json({
      success: true,
      message: 'Authentication configured successfully',
      data: {
        configId: authConfig._id,
        authEnabled: authConfig.authEnabled,
        authType: authConfig.authType,
        createdAt: authConfig.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Auth configuration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to configure authentication',
      error: error.message
    });
  }
};

/**
 * Get current authentication configuration (decrypted, sanitized)
 * GET /api/auth/config
 */
export const getAuthConfig = async (req, res) => {
  try {
    const { zohoOrgId } = req.query;
    
    if (!zohoOrgId) {
      return res.status(400).json({
        success: false,
        message: 'zohoOrgId is required'
      });
    }

    const authConfig = await AuthConfig.findOne({ zohoOrgId }).sort({ createdAt: -1 });
    
    if (!authConfig) {
      return res.json({
        success: true,
        data: {
          authEnabled: false,
          authType: null,
          config: {}
        }
      });
    }
    
    console.log(`🔓 Retrieving auth configuration: ${authConfig.authType || 'disabled'}`);
    
    let sanitizedConfig = { ...authConfig.encryptedConfig };
    
    if (authConfig.authEnabled && authConfig.authType) {
      // Get sensitive fields for this auth type
      const sensitiveFields = SENSITIVE_FIELDS[authConfig.authType] || [];
      
      // Decrypt sensitive fields
      const decryptedConfig = decryptConfig(
        authConfig.encryptedConfig,
        authConfig.ivs,
        authConfig.tags,
        sensitiveFields
      );
      
      // Sanitize: mask sensitive values for response
      sanitizedConfig = { ...decryptedConfig };
      sensitiveFields.forEach(field => {
        if (sanitizedConfig[field]) {
          sanitizedConfig[field] = '***' + sanitizedConfig[field].slice(-4);
        }
      });
      
      console.log(`🔓 Decrypted and sanitized ${sensitiveFields.length} fields`);
    }
    
    return res.json({
      success: true,
      data: {
        configId: authConfig._id,
        authEnabled: authConfig.authEnabled,
        authType: authConfig.authType,
        config: sanitizedConfig,
        createdAt: authConfig.createdAt,
        updatedAt: authConfig.updatedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching auth config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch authentication configuration',
      error: error.message
    });
  }
};

/**
 * Get decrypted auth config for internal use (not exposed via API)
 * Used by agent executor to make authenticated API calls
 */
export const getDecryptedAuthConfig = async (zohoOrgId) => {
  try {
    if (!zohoOrgId) return null;
    
    const authConfig = await AuthConfig.findOne({ zohoOrgId }).sort({ createdAt: -1 });
    
    if (!authConfig || !authConfig.authEnabled) {
      return null;
    }
    
    const sensitiveFields = SENSITIVE_FIELDS[authConfig.authType] || [];
    
    const decryptedConfig = decryptConfig(
      authConfig.encryptedConfig,
      authConfig.ivs,
      authConfig.tags,
      sensitiveFields
    );
    
    return {
      authType: authConfig.authType,
      config: decryptedConfig
    };
  } catch (error) {
    console.error('❌ Error getting decrypted auth config:', error);
    return null;
  }
};
