/**
 * Conversation Model
 * Stores conversation history for context-aware bot responses
 */

import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'bot'],
        required: true
    },
    text: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
    // Unique visitor identifier from SalesIQ
    visitorId: {
        type: String,
        required: true,
        index: true
    },

    // Active conversation ID from SalesIQ
    activeConversationId: {
        type: String,
        required: true
    },

    // Zoho organization ID for multi-tenancy
    orgId: {
        type: String,
        required: true,
        index: true
    },

    // Last 10 messages (user + bot)
    messages: {
        type: [messageSchema],
        default: [],
        validate: {
            validator: function (messages) {
                return messages.length <= 10;
            },
            message: 'Messages array cannot exceed 10 items'
        }
    },

    // User details from SalesIQ webhook
    userDetails: {
        email: String,
        country: String,
        countryCode: String,
        os: String,
        departmentId: String,
        channel: String,
        language: String,
        timeZone: String
    },

    // Request metadata
    requestInfo: {
        appId: String,
        requestId: String
    },

    // Clarification attempt counter for low-confidence scenarios
    clarificationAttempts: {
        type: Number,
        default: 0
    },

    // Cache for auto-resolved parameters (e.g., userId from email lookup)
    resolvedParameters: {
        type: Map,
        of: String,
        default: new Map()
    }
}, { timestamps: true });

// Compound index for efficient querying
conversationSchema.index({ visitorId: 1, orgId: 1 });
conversationSchema.index({ activeConversationId: 1 });

// Method to add a message and maintain max 10 messages
conversationSchema.methods.addMessage = function (role, text) {
    this.messages.push({ role, text, timestamp: new Date() });

    // Keep only last 10 messages (FIFO)
    if (this.messages.length > 10) {
        this.messages = this.messages.slice(-10);
    }

    this.lastActivity = new Date();
    return this.save();
};

// Method to get last N turns of conversation
conversationSchema.methods.getLastNTurns = function (n = 2) {
    // Get last n*2 messages (n user + n bot pairs)
    const lastMessages = this.messages.slice(-(n * 2));
    return lastMessages.map(msg => `${msg.role}: ${msg.text}`).join('\n');
};

// Method to reset clarification attempts
conversationSchema.methods.resetClarificationAttempts = function () {
    this.clarificationAttempts = 0;
    return this.save();
};

// Method to increment clarification attempts
conversationSchema.methods.incrementClarificationAttempts = function () {
    this.clarificationAttempts += 1;
    return this.save();
};

export default mongoose.model('Conversation', conversationSchema);
