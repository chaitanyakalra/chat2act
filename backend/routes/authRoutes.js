import express from 'express';
import { configureAuth, getAuthConfig } from '../controllers/authController.js';

const router = express.Router();

// POST /api/auth/configure - Configure authentication settings
router.post('/configure', configureAuth);

// GET /api/auth/config - Get current authentication configuration
router.get('/config', getAuthConfig);

export default router;
