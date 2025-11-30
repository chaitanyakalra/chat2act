/**
 * SalesIQ OAuth Service
 * Manages OAuth tokens for SalesIQ REST API
 */

import axios from 'axios';
import SalesiqToken from '../models/SalesiqToken.js';

class SalesiqOauthService {
    constructor() {
        // Use Zoho India region for accounts based in India
        // Change this to 'accounts.zoho.com' for US/other regions
        this.tokenEndpoint = 'https://accounts.zoho.in/oauth/v2/token';
        console.log(`🌍 Using Zoho OAuth endpoint: ${this.tokenEndpoint}`);
    }

    /**
     * Get a valid access token for the given screen name
     * @param {String} screenName - SalesIQ portal identifier
     * @returns {Promise<String>} Valid access token
     */
    async getValidAccessToken(screenName) {
        console.log(`🔑 Getting valid access token for screenName: ${screenName}`);

        // Find token in database
        let token = await SalesiqToken.findOne({ screenName });

        if (!token) {
            console.error('❌ No token found for this screen name');
            throw new Error('SalesIQ not authorized. Please complete OAuth flow first.');
        }

        // Check if token needs refresh
        if (token.needsRefresh()) {
            console.log('🔄 Token expired or expiring soon, refreshing...');
            token = await this.refreshAccessToken(screenName);
        }

        console.log('✅ Valid access token retrieved');
        return token.accessToken;
    }

    /**
     * Refresh access token using refresh token
     * @param {String} screenName - SalesIQ portal identifier
     * @returns {Promise<SalesiqToken>} Updated token
     */
    async refreshAccessToken(screenName) {
        console.log(`🔄 Refreshing access token for screenName: ${screenName}`);

        const token = await SalesiqToken.findOne({ screenName });

        if (!token || !token.refreshToken) {
            throw new Error('No refresh token available. Please re-authorize.');
        }

        try {
            // Get client credentials from environment
            const clientId = process.env.SALESIQ_CLIENT_ID;
            const clientSecret = process.env.SALESIQ_CLIENT_SECRET;

            if (!clientId || !clientSecret) {
                throw new Error('SALESIQ_CLIENT_ID and SALESIQ_CLIENT_SECRET must be set in .env');
            }

            // Request new access token
            const response = await axios.post(this.tokenEndpoint, null, {
                params: {
                    refresh_token: token.refreshToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'refresh_token'
                }
            });

            const data = response.data;

            // Update token in database
            token.accessToken = data.access_token;
            if (data.refresh_token) {
                token.refreshToken = data.refresh_token;
            }
            token.expiresAt = new Date(Date.now() + data.expires_in * 1000);

            await token.save();

            console.log('✅ Access token refreshed successfully');
            return token;

        } catch (error) {
            console.error('❌ Error refreshing token:', error.response?.data || error.message);
            throw new Error('Failed to refresh access token. Please re-authorize.');
        }
    }

    /**
     * Store new OAuth token
     * @param {Object} params - Token parameters
     * @param {String} params.screenName - SalesIQ portal identifier
     * @param {String} params.accessToken - OAuth access token
     * @param {String} params.refreshToken - OAuth refresh token
     * @param {Number} params.expiresIn - Token expiration in seconds
     * @returns {Promise<SalesiqToken>} Saved token
     */
    async storeToken({ screenName, accessToken, refreshToken, expiresIn }) {
        console.log(`💾 Storing OAuth token for screenName: ${screenName}`);

        // Ensure expiresIn is a number, default to 3600 if invalid
        const seconds = typeof expiresIn === 'number' ? expiresIn : 3600;
        const expiresAt = new Date(Date.now() + seconds * 1000);

        // Upsert token
        const token = await SalesiqToken.findOneAndUpdate(
            { screenName },
            {
                screenName,
                accessToken,
                refreshToken,
                expiresAt
            },
            {
                upsert: true,
                new: true
            }
        );

        console.log(`✅ Token stored successfully, expires at: ${expiresAt.toISOString()}`);
        return token;
    }

    /**
     * Exchange authorization code for tokens
     * @param {String} code - Authorization code from OAuth callback
     * @param {String} clientId - OAuth client ID
     * @param {String} clientSecret - OAuth client secret
     * @param {String} redirectUrl - OAuth redirect URL
     * @returns {Promise<Object>} Token data
     */
    async exchangeCodeForTokens(code, clientId, clientSecret, redirectUrl) {
        console.log('🔄 Exchanging authorization code for tokens...');
        console.log(`   Client ID: ${clientId}`);
        console.log(`   Redirect URI: ${redirectUrl}`);
        console.log(`   Client Secret: ${clientSecret ? '✅ Provided' : '❌ Missing'}`);

        try {
            const response = await axios.post(this.tokenEndpoint, null, {
                params: {
                    code,
                    client_id: clientId,
                    client_secret: clientSecret,
                    redirect_uri: redirectUrl,
                    grant_type: 'authorization_code'
                }
            });

            console.log('✅ Successfully exchanged code for tokens');
            return response.data;

        } catch (error) {
            console.error('❌ Error exchanging code:', error.response?.data || error.message);
            throw new Error('Failed to exchange authorization code for tokens');
        }
    }
}

export default new SalesiqOauthService();
