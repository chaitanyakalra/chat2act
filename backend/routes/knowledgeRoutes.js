import express from 'express';
import { ingestKnowledge, getLearnedSkills } from '../controllers/knowledgeController.js';

const router = express.Router();

// POST /api/knowledge/ingest - Ingest API documentation
router.post('/ingest', ingestKnowledge);

// GET /api/skills - Get all learned skills/endpoints
router.get('/skills', getLearnedSkills);

export default router;
