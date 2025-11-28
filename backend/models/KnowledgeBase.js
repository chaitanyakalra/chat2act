import mongoose from 'mongoose';

const knowledgeBaseSchema = new mongoose.Schema({
  sourceUrl: {
    type: String,
    default: null
  },
  sourceType: {
    type: String,
    enum: ['url', 'file'],
    required: true
  },
  fileName: {
    type: String,
    default: null
  },
  rawContent: {
    type: String,
    required: true
  },
  parsedEndpoints: [{
    method: String,
    endpoint: String,
    description: String,
    parameters: mongoose.Schema.Types.Mixed
  }],
  pineconeNamespace: {
    type: String,
    default: null,
    comment: 'Namespace in Pinecone for vector storage'
  },
  status: {
    type: String,
    enum: ['processing', 'completed', 'failed'],
    default: 'processing'
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
knowledgeBaseSchema.pre('save', function() {
  this.updatedAt = Date.now();
});

export default mongoose.model('KnowledgeBase', knowledgeBaseSchema);
