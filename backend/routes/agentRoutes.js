import express from 'express';
import { executeAgent } from '../controllers/agentController.js';

const router = express.Router();

// POST /api/agent/execute - Execute natural language query
router.post('/execute', executeAgent);

export default router;
