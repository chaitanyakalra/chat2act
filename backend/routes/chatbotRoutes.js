/**
 * Chatbot Routes
 * Handles SalesIQ webhook integration and OAuth
 */

import express from "express";
import chatbotController from "../controllers/chatbotController.js";
import salesiqOauthService from "../services/salesiqOauthService.js";

const router = express.Router();

// SalesIQ webhook endpoint
router.post("/webhook", chatbotController.handleWebhook);

// SalesIQ OAuth routes
/**
 * Start OAuth flow for SalesIQ REST API
 * Usage: GET /chatbot/webhook/salesiq/oauth/connect
 */
router.get("/webhook/salesiq/oauth/connect", async (req, res) => {
    try {
        console.log('\n🔗 Starting SalesIQ OAuth flow...');

        // Get config from environment
        const clientId = process.env.SALESIQ_CLIENT_ID;
        const redirectUrl = process.env.SALESIQ_REDIRECT_URL;
        const scopes = process.env.SALESIQ_SCOPES || 'SalesIQ.conversations.CREATE,SalesIQ.conversations.READ';

        if (!clientId || !redirectUrl) {
            return res.status(500).send('SALESIQ_CLIENT_ID and SALESIQ_REDIRECT_URL must be set in .env');
        }

        // Build OAuth URL (use India region)
        const authUrl = new URL('https://accounts.zoho.in/oauth/v2/auth');
        authUrl.searchParams.append('scope', scopes);
        authUrl.searchParams.append('client_id', clientId);
        authUrl.searchParams.append('response_type', 'code');
        authUrl.searchParams.append('redirect_uri', redirectUrl);
        authUrl.searchParams.append('access_type', 'offline');

        console.log(`✅ Redirecting to Zoho OAuth (India region)...`);
        console.log(`📍 Redirect URL: ${authUrl.toString()}`);

        // Redirect to Zoho OAuth
        res.redirect(authUrl.toString());

    } catch (error) {
        console.error('❌ Error starting OAuth flow:', error);
        res.status(500).send('Error starting OAuth flow: ' + error.message);
    }
});

/**
 * OAuth callback - receives authorization code
 * Usage: GET /chatbot/webhook/salesiq/oauth/callback?code=...
 */
router.get("/webhook/salesiq/oauth/callback", async (req, res) => {
    try {
        console.log('\n🔙 OAuth callback received');

        const { code } = req.query;

        if (!code) {
            return res.status(400).send('Authorization code not provided');
        }

        console.log('📝 Authorization code received');

        // Get config from environment
        const clientId = process.env.SALESIQ_CLIENT_ID;
        const clientSecret = process.env.SALESIQ_CLIENT_SECRET;
        const redirectUrl = process.env.SALESIQ_REDIRECT_URL;
        const screenName = process.env.SALESIQ_SCREEN_NAME;

        if (!clientId || !clientSecret || !redirectUrl || !screenName) {
            return res.status(500).send('Missing required environment variables');
        }

        // Exchange code for tokens
        const tokenData = await salesiqOauthService.exchangeCodeForTokens(
            code,
            clientId,
            clientSecret,
            redirectUrl
        );

        console.log('📦 Token Data from Zoho:', JSON.stringify(tokenData, null, 2));

        // Store tokens
        await salesiqOauthService.storeToken({
            screenName,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresIn: tokenData.expires_in || 3600 // Default to 1 hour if missing
        });

        console.log('✅ OAuth flow completed successfully!');

        // Return success page
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>SalesIQ Authorized</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 10px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        text-align: center;
                    }
                    h1 {
                        color: #4CAF50;
                        margin-bottom: 20px;
                    }
                    p {
                        color: #666;
                        font-size: 16px;
                    }
                    .checkmark {
                        font-size: 60px;
                        color: #4CAF50;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="checkmark">✓</div>
                    <h1>SalesIQ Authorized!</h1>
                    <p>Your bot can now send proactive messages to SalesIQ conversations.</p>
                    <p style="margin-top: 20px; color: #999;">You can close this tab.</p>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('❌ Error in OAuth callback:', error);
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Authorization Failed</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: #f5f5f5;
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 10px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                        text-align: center;
                    }
                    h1 {
                        color: #f44336;
                    }
                    p {
                        color: #666;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>❌ Authorization Failed</h1>
                    <p>${error.message}</p>
                    <p style="margin-top: 20px;">Please try again or contact support.</p>
                </div>
            </body>
            </html>
        `);
    }
});

/**
 * Receive OAuth token from third-party SaaS (user login)
 * POST /chatbot/webhook/salesiq/oauth/callback
 */
router.post("/webhook/salesiq/oauth/callback", async (req, res) => {
    try {
        console.log('\n📥 Received OAuth token from third-party SaaS');
        console.log('Payload:', JSON.stringify(req.body, null, 2));

        const { event, token, user, timestamp } = req.body;

        // Handle token as JWT string
        const accessToken = typeof token === 'string' ? token : token?.access_token;

        if (!accessToken) {
            return res.status(400).json({
                success: false,
                error: 'Missing access token'
            });
        }

        // Extract userId from user._id
        const userId = user?._id;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: user._id'
            });
        }

        // Import Organization model
        const Organization = (await import('../models/Organization.js')).default;

        // Find or create by userId
        let organization = await Organization.findOne({ userId });

        if (!organization) {
            console.log(`📝 Creating new user entry: ${userId}`);
            organization = new Organization({
                userId,
                name: user.name || user.email || userId,
                status: 'pending'  // Pending until orgId is set from chatbot webhook
            });
        } else {
            console.log(`✅ Found existing user: ${organization.name}`);
        }

        // Update OAuth credentials
        organization.oauthCredentials = {
            accessToken,
            tokenType: 'Bearer',
            expiresAt: new Date(Date.now() + 3600 * 1000)  // 1 hour default
        };

        // Store metadata
        if (user.email) {
            if (!organization.metadata) {
                organization.metadata = new Map();
            }
            organization.metadata.set('contact_email', user.email);
            organization.metadata.set('contact_name', user.name);
            if (user.mobile) {
                organization.metadata.set('contact_mobile', user.mobile);
            }
        }

        await organization.save();

        console.log(`✅ OAuth token stored for user: ${userId}`);
        console.log(`   ⏳ Waiting for orgId from chatbot webhook...`);

        res.json({
            success: true,
            message: 'Token stored successfully',
            user_id: userId,
            note: 'orgId will be set when user interacts with chatbot'
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

// Direct session parameter storage (bypasses Zoho webhook)
router.post("/session", chatbotController.storeSessionParams);

export default router;
