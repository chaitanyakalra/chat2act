/**
 * Conversation Model
 * Stores conversation history for context-aware bot responses
 */

import mongoose from 'mongoose';
import redisService from '../services/redisService.js';

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

    // Cache for auto-resolved parameters (e.g., userId, email, phone, accountNumber)
    // This serves as durable storage, synced with Redis for fast access
    knownIds: {
        type: Map,
        of: String,
        default: new Map()
    },

    // Cache for background pipeline results (when webhook times out)
    lastPendingResult: {
        text: String,
        timestamp: Date,
        consumed: { type: Boolean, default: false }
    },

    // SalesIQ screen name (portal identifier)
    screenName: {
        type: String,
        required: false
    },

    // Pending reply text (fallback if proactive send fails)
    pendingReplyText: {
        type: String,
        required: false
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

// Method to store pending result from background pipeline
conversationSchema.methods.setPendingResult = function (text) {
    this.lastPendingResult = {
        text,
        timestamp: new Date(),
        consumed: false
    };
    console.log('💾 Cached pending result for later retrieval');
    return this.save();
};

// Method to retrieve and consume pending result
conversationSchema.methods.consumePendingResult = function () {
    if (!this.lastPendingResult || this.lastPendingResult.consumed) {
        return null;
    }

    // Check if result is still fresh (within 5 minutes)
    const age = Date.now() - new Date(this.lastPendingResult.timestamp).getTime();
    if (age > 5 * 60 * 1000) {
        console.log('⏰ Pending result expired (>5 min old)');
        return null;
    }

    const result = this.lastPendingResult.text;
    this.lastPendingResult.consumed = true;
    this.save();

    console.log('✅ Retrieved cached pending result');
    return result;
};

// Method to get knownIds (from Redis first, fallback to Mongo)
conversationSchema.methods.getKnownIds = async function () {
    const conversationKey = `${this.orgId}:${this.visitorId}`;
    
    // Try Redis first
    const cachedIds = await redisService.getKnownIds(conversationKey);
    if (cachedIds) {
        return cachedIds;
    }
    
    // Fallback to Mongo
    if (this.knownIds && this.knownIds.size > 0) {
        const knownIdsObj = Object.fromEntries(this.knownIds);
        // Sync to Redis for next time
        await redisService.setKnownIds(conversationKey, knownIdsObj);
        return knownIdsObj;
    }
    
    return {};
};

// Method to set a single knownId (writes to both Redis and Mongo)
conversationSchema.methods.setKnownId = async function (key, value) {
    const conversationKey = `${this.orgId}:${this.visitorId}`;
    
    // Update Mongo
    if (!this.knownIds) {
        this.knownIds = new Map();
    }
    this.knownIds.set(key, value);
    await this.save();
    
    // Update Redis
    await redisService.updateKnownId(conversationKey, key, value);
    
    console.log(`💾 Saved ${key} to knownIds cache (Redis + Mongo)`);
};

// Method to get all knownIds as plain object
conversationSchema.methods.getAllKnownIds = function () {
    if (!this.knownIds || this.knownIds.size === 0) {
        return {};
    }
    return Object.fromEntries(this.knownIds);
};

// Method to sync knownIds from Mongo to Redis
conversationSchema.methods.syncKnownIdsToRedis = async function () {
    if (!this.knownIds || this.knownIds.size === 0) {
        return;
    }
    
    const conversationKey = `${this.orgId}:${this.visitorId}`;
    const knownIdsObj = Object.fromEntries(this.knownIds);
    await redisService.setKnownIds(conversationKey, knownIdsObj);
    
    console.log(`🔄 Synced knownIds to Redis for ${conversationKey}`);
};

export default mongoose.model('Conversation', conversationSchema);
