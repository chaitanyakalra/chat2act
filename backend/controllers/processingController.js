/**
 * Processing Controller - Handles API documentation processing requests
 */

import { ProcessingPipeline } from '../services/processingPipeline.js';
import ApiDoc from '../models/ApiDoc.js';

let pipeline = null;

function getPipeline() {
    if (!pipeline) {
        pipeline = new ProcessingPipeline();
    }
    return pipeline;
}

/**
 * Start processing API documentation
 */
export const startProcessing = async (req, res) => {
    try {
        const { docId } = req.body;

        if (!docId) {
            return res.status(400).json({ message: 'docId is required' });
        }

        // Get the uploaded document
        const apiDoc = await ApiDoc.findById(docId);
        if (!apiDoc) {
            return res.status(404).json({ message: 'Document not found' });
        }

        // Start processing
        const result = await getPipeline().process(
            docId,
            apiDoc.rawText,
            'application/json' // Default, could be enhanced to detect from file
        );

        return res.json({
            message: 'Processing completed successfully',
            ...result
        });
    } catch (error) {
        console.error('Processing error:', error);
        return res.status(500).json({
            message: 'Processing failed',
            error: error.message
        });
    }
};

/**
 * Get processing status
 */
export const getProcessingStatus = async (req, res) => {
    try {
        const { docId } = req.params;

        if (!docId) {
            return res.status(400).json({ message: 'docId is required' });
        }

        const status = await getPipeline().getStatus(docId);

        return res.json(status);
    } catch (error) {
        console.error('Status check error:', error);
        return res.status(500).json({
            message: 'Failed to get status',
            error: error.message
        });
    }
};

/**
 * Get API index
 */
export const getApiIndex = async (req, res) => {
    try {
        const ApiIndex = (await import('../models/ApiIndex.js')).default;
        const { apiIndexId } = req.params;

        const apiIndex = await ApiIndex.findById(apiIndexId);
        if (!apiIndex) {
            return res.status(404).json({ message: 'API index not found' });
        }

        return res.json(apiIndex);
    } catch (error) {
        console.error('Get API index error:', error);
        return res.status(500).json({
            message: 'Failed to get API index',
            error: error.message
        });
    }
};

/**
 * Get intent mappings
 */
export const getIntentMappings = async (req, res) => {
    try {
        const IntentMapping = (await import('../models/IntentMapping.js')).default;
        const { intentMappingId } = req.params;

        const intentMapping = await IntentMapping.findById(intentMappingId);
        if (!intentMapping) {
            return res.status(404).json({ message: 'Intent mapping not found' });
        }

        return res.json(intentMapping);
    } catch (error) {
        console.error('Get intent mappings error:', error);
        return res.status(500).json({
            message: 'Failed to get intent mappings',
            error: error.message
        });
    }
};

