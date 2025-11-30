/**
 * SalesiqToken Model
 * Stores OAuth tokens for SalesIQ REST API
 */

import mongoose from 'mongoose';

const salesiqTokenSchema = new mongoose.Schema({
    // SalesIQ portal identifier (e.g., "zylkerinc")
    screenName: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // OAuth access token
    accessToken: {
        type: String,
        required: true
    },

    // OAuth refresh token
    refreshToken: {
        type: String,
        required: true
    },

    // Token expiration timestamp
    expiresAt: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

// Method to check if token is expired
salesiqTokenSchema.methods.isExpired = function () {
    return new Date() >= this.expiresAt;
};

// Method to check if token needs refresh (expires in < 5 minutes)
salesiqTokenSchema.methods.needsRefresh = function () {
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
    return this.expiresAt <= fiveMinutesFromNow;
};

export default mongoose.model('SalesiqToken', salesiqTokenSchema);
