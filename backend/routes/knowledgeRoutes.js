import express from 'express';
import { ingestKnowledge, getLearnedSkills, analyzeKnowledge } from '../controllers/knowledgeController.js';

const router = express.Router();

// POST /api/knowledge/ingest - Ingest API documentation
router.post('/ingest', ingestKnowledge);

// POST /api/knowledge/analyze - Analyze API documentation
router.post('/analyze', analyzeKnowledge);

// GET /api/skills - Get all learned skills/endpoints
router.get('/skills', getLearnedSkills);

export default router;
