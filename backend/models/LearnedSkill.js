import mongoose from 'mongoose';

const learnedSkillSchema = new mongoose.Schema({
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
  },
  endpoint: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  parameters: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Reference to the knowledge base document
  knowledgeBaseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KnowledgeBase',
    required: true
  },
  // Pinecone vector ID for semantic search
  vectorId: {
    type: String,
    default: null,
    comment: 'ID of the vector stored in Pinecone'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
learnedSkillSchema.index({ knowledgeBaseId: 1 });
learnedSkillSchema.index({ method: 1, endpoint: 1 });

export default mongoose.model('LearnedSkill', learnedSkillSchema);
