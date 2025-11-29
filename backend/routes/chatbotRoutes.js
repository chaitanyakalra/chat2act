/**
 * Chatbot Routes
 * Handles SalesIQ webhook integration
 */

import express from "express";
import chatbotController from "../controllers/chatbotController.js";

const router = express.Router();

// SalesIQ webhook endpoint
router.post("/webhook", chatbotController.handleWebhook);

export default router;
