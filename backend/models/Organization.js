/**
 * Organization Model
 * Stores organization details and OAuth credentials
 */

import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema({
    // Zoho Organization ID (used as Pinecone namespace)
    orgId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    // Organization name
    name: {
        type: String,
        required: true
    },

    // OAuth credentials for API execution
    oauthCredentials: {
        accessToken: {
            type: String,
            required: false
        },
        refreshToken: {
            type: String,
            required: false
        },
        tokenType: {
            type: String,
            default: 'Bearer'
        },
        expiresAt: {
            type: Date,
            required: false
        },
        scope: {
            type: String,
            required: false
        },
        // URL to refresh the token
        tokenRefreshUrl: {
            type: String,
            required: false
        },
        // Client credentials for token refresh
        clientId: {
            type: String,
            required: false
        },
        clientSecret: {
            type: String,
            required: false
        }
    },

    // API base URL for this organization
    apiBaseUrl: {
        type: String,
        required: false
    },

    // Active API documentation ID
    activeApiDocId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ApiDoc',
        required: false
    },

    // Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'pending'],
        default: 'pending'
    },

    // Metadata
    metadata: {
        type: Map,
        of: String,
        default: {}
    }
}, {
    timestamps: true
});

// Method to check if OAuth token is valid
organizationSchema.methods.isTokenValid = function () {
    if (!this.oauthCredentials?.accessToken) {
        return false;
    }

    if (!this.oauthCredentials.expiresAt) {
        return true; // Assume valid if no expiry set
    }

    return new Date() < new Date(this.oauthCredentials.expiresAt);
};

// Method to update OAuth token
organizationSchema.methods.updateOAuthToken = function (tokenData) {
    this.oauthCredentials = {
        ...this.oauthCredentials,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || this.oauthCredentials?.refreshToken,
        expiresAt: tokenData.expires_in
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : this.oauthCredentials?.expiresAt,
        scope: tokenData.scope || this.oauthCredentials?.scope
    };

    return this.save();
};

export default mongoose.model('Organization', organizationSchema);
