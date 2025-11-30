/**
 * Chatbot Routes
 * Handles SalesIQ webhook integration
 */

import express from "express";
import chatbotController from "../controllers/chatbotController.js";

const router = express.Router();

// SalesIQ webhook endpoint
router.post("/webhook", chatbotController.handleWebhook);

// Direct session parameter storage (bypasses Zoho webhook)
router.post("/session", chatbotController.storeSessionParams);

export default router;
