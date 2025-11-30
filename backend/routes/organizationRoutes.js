/**
 * Organization OAuth Routes
 * Handles OAuth token reception from third-party SaaS companies
 */

import express from "express";
import Organization from "../models/Organization.js";

const router = express.Router();

/**
 * Receive OAuth token from third-party SaaS company
 * POST /api/organization/oauth/callback
 * 
 * Expected payload:
 * {
 *   "event": "token_created" | "token_refreshed",
 *   "token": {
 *     "access_token": "...",
 *     "refresh_token": "...",
 *     "expires_in": 3600,
 *     "token_type": "Bearer",
 *     "scope": "..."
 *   },
 *   "user": {
 *     "org_id": "...",
 *     "org_name": "...",
 *     "email": "..."
 *   },
 *   "timestamp": "2024-01-01T00:00:00Z"
 * }
 */
router.post("/oauth/callback", async (req, res) => {
    try {
        console.log('\n📥 Received OAuth token from third-party SaaS');
        console.log('Payload:', JSON.stringify(req.body, null, 2));

        const { event, token, user, timestamp } = req.body;

        // Validation
        if (!token || !token.access_token) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: token.access_token'
            });
        }

        if (!user || !user.org_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: user.org_id'
            });
        }

        // Calculate token expiration
        const expiresAt = token.expires_in
            ? new Date(Date.now() + token.expires_in * 1000)
            : new Date(Date.now() + 3600 * 1000); // Default 1 hour

        // Find or create organization
        let organization = await Organization.findOne({ orgId: user.org_id });

        if (!organization) {
            console.log(`📝 Creating new organization: ${user.org_id}`);
            organization = new Organization({
                orgId: user.org_id,
                name: user.org_name || user.org_id,
                status: 'active'
            });
        } else {
            console.log(`✅ Found existing organization: ${organization.name}`);
        }

        // Update OAuth credentials
        organization.oauthCredentials = {
            accessToken: token.access_token,
            refreshToken: token.refresh_token || organization.oauthCredentials?.refreshToken,
            tokenType: token.token_type || 'Bearer',
            expiresAt: expiresAt,
            scope: token.scope || organization.oauthCredentials?.scope
        };

        // Store additional metadata if provided
        if (user.email) {
            if (!organization.metadata) {
                organization.metadata = new Map();
            }
            organization.metadata.set('contact_email', user.email);
        }

        await organization.save();

        console.log(`✅ OAuth token stored successfully for org: ${user.org_id}`);
        console.log(`   Token expires at: ${expiresAt.toISOString()}`);
        console.log(`   Event: ${event || 'token_received'}`);

        // Return success response
        res.json({
            success: true,
            message: 'OAuth token received and stored successfully',
            org_id: user.org_id,
            expires_at: expiresAt.toISOString()
        });

    } catch (error) {
        console.error('❌ Error processing OAuth callback:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * Health check endpoint
 * GET /api/organization/oauth/health
 */
router.get("/oauth/health", (req, res) => {
    res.json({
        success: true,
        message: 'OAuth callback endpoint is ready',
        endpoint: '/api/organization/oauth/callback'
    });
});

export default router;
