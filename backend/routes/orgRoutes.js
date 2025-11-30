import express from 'express';
import { checkOrgExists } from '../controllers/orgController.js';

const router = express.Router();

// Check if organization exists
router.get('/check/:zohoOrgId', checkOrgExists);

export default router;
