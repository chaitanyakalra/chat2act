import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.warn('⚠️  ENCRYPTION_KEY not set or invalid. Please set a 64-character hex string in .env');
}

/**
 * Encrypt sensitive text using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {object} - { encrypted, iv, tag } - All as hex strings
 */
export const encrypt = (text) => {
  if (!text) return { encrypted: '', iv: '', tag: '' };
  
  try {
    // Generate random initialization vector
    const iv = crypto.randomBytes(16);
    
    // Create cipher
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      iv
    );
    
    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get authentication tag
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  } catch (error) {
    console.error('❌ Encryption error:', error.message);
    throw new Error('Encryption failed');
  }
};

/**
 * Decrypt encrypted text using AES-256-GCM
 * @param {string} encrypted - Encrypted text (hex)
 * @param {string} ivHex - Initialization vector (hex)
 * @param {string} tagHex - Authentication tag (hex)
 * @returns {string} - Decrypted plain text
 */
export const decrypt = (encrypted, ivHex, tagHex) => {
  if (!encrypted || !ivHex || !tagHex) return '';
  
  try {
    // Create decipher
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, 'hex'),
      Buffer.from(ivHex, 'hex')
    );
    
    // Set authentication tag
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    
    // Decrypt the text
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ Decryption error:', error.message);
    throw new Error('Decryption failed');
  }
};

/**
 * Encrypt an object's sensitive fields
 * @param {object} config - Configuration object
 * @param {array} sensitiveFields - Array of field names to encrypt
 * @returns {object} - { encryptedConfig, iv, tag }
 */
export const encryptConfig = (config, sensitiveFields = []) => {
  const encryptedConfig = { ...config };
  const encryptionData = {};
  
  sensitiveFields.forEach(field => {
    if (config[field]) {
      const { encrypted, iv, tag } = encrypt(config[field]);
      encryptedConfig[field] = encrypted;
      
      // Store IV and tag for each field
      if (!encryptionData.ivs) encryptionData.ivs = {};
      if (!encryptionData.tags) encryptionData.tags = {};
      
      encryptionData.ivs[field] = iv;
      encryptionData.tags[field] = tag;
    }
  });
  
  return {
    encryptedConfig,
    ...encryptionData
  };
};

/**
 * Decrypt an object's encrypted fields
 * @param {object} encryptedConfig - Configuration object with encrypted fields
 * @param {object} ivs - Object mapping field names to IVs
 * @param {object} tags - Object mapping field names to tags
 * @param {array} sensitiveFields - Array of field names to decrypt
 * @returns {object} - Decrypted configuration
 */
export const decryptConfig = (encryptedConfig, ivs = {}, tags = {}, sensitiveFields = []) => {
  const decryptedConfig = { ...encryptedConfig };
  
  sensitiveFields.forEach(field => {
    if (encryptedConfig[field] && ivs[field] && tags[field]) {
      try {
        decryptedConfig[field] = decrypt(
          encryptedConfig[field],
          ivs[field],
          tags[field]
        );
      } catch (error) {
        console.error(`Failed to decrypt field: ${field}`);
        decryptedConfig[field] = null;
      }
    }
  });
  
  return decryptedConfig;
};

/**
 * Generate a random encryption key (for setup)
 * @returns {string} - 64-character hex string
 */
export const generateEncryptionKey = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Log encryption key status on import
if (ENCRYPTION_KEY) {
  console.log('🔐 Encryption module loaded successfully');
} else {
  console.log('💡 To generate an encryption key, run: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
}
