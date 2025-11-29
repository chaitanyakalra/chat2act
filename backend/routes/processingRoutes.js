import express from "express";
import {
    startProcessing,
    getProcessingStatus,
    getApiIndex,
    getIntentMappings
} from "../controllers/processingController.js";

const router = express.Router();

router.post("/start", startProcessing);
router.get("/status/:docId", getProcessingStatus);
router.get("/api-index/:apiIndexId", getApiIndex);
router.get("/intent-mappings/:intentMappingId", getIntentMappings);

export default router;



