import mongoose from 'mongoose';

const authConfigSchema = new mongoose.Schema({
  authEnabled: {
    type: Boolean,
    required: true,
    default: false
  },
  authType: {
    type: String,
    enum: ['oauth2', 'apiKey', 'bearer', 'basic', 'custom'],
    default: null
  },
  // Encrypted configuration object
  encryptedConfig: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Encryption metadata - stores IVs and tags for each encrypted field
  ivs: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  tags: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
authConfigSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

export default mongoose.model('AuthConfig', authConfigSchema);
