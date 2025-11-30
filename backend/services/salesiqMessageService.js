/**
 * SalesIQ Message Service
 * Sends operator messages to SalesIQ conversations via REST API
 */

import axios from 'axios';
import salesiqOauthService from './salesiqOauthService.js';

class SalesiqMessageService {
    constructor() {
        this.baseUrl = 'https://salesiq.zoho.com/api/v2';
    }

    /**
     * Send an operator message to a SalesIQ conversation
     * @param {Object} params - Message parameters
     * @param {String} params.conversationId - SalesIQ conversation ID
     * @param {String} params.text - Message text to send
     * @param {String} params.screenName - SalesIQ portal identifier
     * @returns {Promise<Object>} { success: boolean, error?: string }
     */
    async sendOperatorMessage({ conversationId, text, screenName }) {
        console.log(`\n📤 Attempting to send proactive message to conversation: ${conversationId}`);
        console.log(`📝 Message: "${text}"`);

        if (!conversationId || !text || !screenName) {
            console.error('❌ Missing required parameters');
            return { success: false, error: 'Missing required parameters' };
        }

        try {
            // Get valid access token
            const accessToken = await salesiqOauthService.getValidAccessToken(screenName);

            // Build API URL
            const url = `${this.baseUrl}/${screenName}/conversations/${conversationId}/messages`;

            // Send message
            const response = await axios.post(
                url,
                { text },
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000 // 5 second timeout
                }
            );

            console.log('✅ Proactive message sent successfully');
            console.log(`📊 Response status: ${response.status}`);
            return { success: true };

        } catch (error) {
            return await this.handleSendError(error, { conversationId, text, screenName });
        }
    }

    /**
     * Handle errors from send message API
     * @param {Error} error - Axios error
     * @param {Object} params - Original message parameters
     * @returns {Promise<Object>} { success: boolean, error: string }
     */
    async handleSendError(error, params) {
        const status = error.response?.status;
        const errorData = error.response?.data;

        console.error(`❌ Error sending proactive message (Status: ${status})`);
        console.error('Error details:', errorData || error.message);

        // Handle specific error cases
        switch (status) {
            case 401:
                // Unauthorized - try refreshing token and retry once
                console.log('🔄 Received 401, attempting token refresh and retry...');
                try {
                    await salesiqOauthService.refreshAccessToken(params.screenName);
                    return await this.retryOnce(params);
                } catch (refreshError) {
                    console.error('❌ Token refresh failed:', refreshError.message);
                    return { success: false, error: 'Authentication failed. Please re-authorize SalesIQ.' };
                }

            case 404:
                // Conversation not found (likely closed)
                console.error('❌ Conversation not found or closed');
                return { success: false, error: 'Conversation not found or closed' };

            case 429:
                // Rate limit
                console.error('❌ Rate limit exceeded');
                return { success: false, error: 'Rate limit exceeded' };

            case 500:
            case 502:
            case 503:
                // Server errors - retry once with delay
                console.log('🔄 Server error, retrying once after 1s delay...');
                await this.delay(1000);
                return await this.retryOnce(params);

            default:
                return { success: false, error: error.message };
        }
    }

    /**
     * Retry sending message once
     * @param {Object} params - Message parameters
     * @returns {Promise<Object>} { success: boolean, error?: string }
     */
    async retryOnce(params) {
        console.log('🔁 Retrying message send...');

        try {
            const accessToken = await salesiqOauthService.getValidAccessToken(params.screenName);
            const url = `${this.baseUrl}/${params.screenName}/conversations/${params.conversationId}/messages`;

            const response = await axios.post(
                url,
                { text: params.text },
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                }
            );

            console.log('✅ Retry successful!');
            return { success: true };

        } catch (retryError) {
            console.error('❌ Retry failed:', retryError.response?.data || retryError.message);
            return { success: false, error: 'Retry failed: ' + retryError.message };
        }
    }

    /**
     * Delay helper
     * @param {Number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default new SalesiqMessageService();
