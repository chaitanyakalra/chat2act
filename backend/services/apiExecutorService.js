/**
 * API Executor Service
 * Handles OAuth token management and API execution
 */

import axios from 'axios';
import Organization from '../models/Organization.js';
import ApiIndex from '../models/ApiIndex.js';

export class ApiExecutorService {
    /**
     * Execute an API call with OAuth authentication
     * @param {String} endpointId - The endpoint ID to call
     * @param {Object} parameters - Parameters to pass to the endpoint
     * @param {String} orgId - Organization ID for OAuth credentials
     * @param {String} apiIndexId - API Index ID to get endpoint spec
     * @returns {Promise<Object>} API response
     */
    async executeApiCall(endpointId, parameters, orgId, apiIndexId) {
        try {
            console.log(`📞 Executing API call for endpoint: ${endpointId}`);

            // 1. Get endpoint specification
            const endpoint = await this.getEndpointSpec(endpointId, apiIndexId);
            if (!endpoint) {
                throw new Error(`Endpoint ${endpointId} not found`);
            }

            // 2. Get OAuth token
            const token = await this.getOAuthToken(orgId);

            // 3. Get organization for API base URL
            const org = await Organization.findOne({ orgId });
            if (!org || !org.apiBaseUrl) {
                throw new Error('Organization API base URL not configured');
            }

            // 4. Build request
            const request = this.buildRequest(endpoint, parameters, token, org.apiBaseUrl);

            // 5. Execute request
            console.log(`🚀 Calling ${request.method} ${request.url}`);
            const response = await axios(request);

            console.log(`✅ API call successful: ${response.status}`);
            return {
                success: true,
                status: response.status,
                data: response.data,
                endpoint: `${endpoint.method} ${endpoint.path}`
            };

        } catch (error) {
            console.error(`❌ API execution error:`, error.message);

            // User-friendly error messages
            if (error.response) {
                // API returned error response
                return {
                    success: false,
                    error: 'API_ERROR',
                    message: 'Sorry, that action failed—try again shortly',
                    details: {
                        status: error.response.status,
                        endpoint: endpointId
                    }
                };
            } else if (error.message.includes('OAuth')) {
                // OAuth/Auth error
                return {
                    success: false,
                    error: 'AUTH_ERROR',
                    message: 'Authentication failed—please contact support',
                    details: { endpoint: endpointId }
                };
            } else {
                // Generic error
                return {
                    success: false,
                    error: 'EXECUTION_ERROR',
                    message: 'Sorry, that action failed—try again shortly',
                    details: { endpoint: endpointId }
                };
            }
        }
    }

    /**
     * Get endpoint specification from API Index
     */
    async getEndpointSpec(endpointId, apiIndexId) {
        const apiIndex = await ApiIndex.findById(apiIndexId);
        if (!apiIndex) {
            throw new Error('API Index not found');
        }

        const endpoint = apiIndex.endpoints.find(ep => ep.endpointId === endpointId);
        return endpoint;
    }

    /**
     * Get valid OAuth token for organization
     */
    async getOAuthToken(orgId) {
        const org = await Organization.findOne({ orgId });

        if (!org) {
            throw new Error('Organization not found');
        }

        if (!org.oauthCredentials || !org.oauthCredentials.accessToken) {
            throw new Error('OAuth credentials not configured for this organization');
        }

        // Check if token is valid
        if (org.isTokenValid()) {
            return org.oauthCredentials.accessToken;
        }

        // Token expired, refresh it
        console.log('🔄 OAuth token expired, refreshing...');
        const newToken = await this.refreshOAuthToken(org);
        return newToken;
    }

    /**
     * Refresh OAuth token
     */
    async refreshOAuthToken(org) {
        if (!org.oauthCredentials.refreshToken || !org.oauthCredentials.tokenRefreshUrl) {
            throw new Error('Cannot refresh token: missing refresh token or refresh URL');
        }

        try {
            const response = await axios.post(org.oauthCredentials.tokenRefreshUrl, {
                grant_type: 'refresh_token',
                refresh_token: org.oauthCredentials.refreshToken,
                client_id: org.oauthCredentials.clientId,
                client_secret: org.oauthCredentials.clientSecret
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            // Update organization with new token
            await org.updateOAuthToken(response.data);

            console.log('✅ OAuth token refreshed successfully');
            return response.data.access_token;

        } catch (error) {
            console.error('❌ Token refresh failed:', error.message);
            throw new Error('OAuth token refresh failed');
        }
    }

    /**
     * Build HTTP request from endpoint spec and parameters
     */
    buildRequest(endpoint, parameters, token, baseUrl) {
        // Build URL
        let url = baseUrl + endpoint.path;

        // Replace path parameters
        if (endpoint.parameters) {
            endpoint.parameters.forEach(param => {
                if (param.in === 'path' && parameters[param.name]) {
                    url = url.replace(`{${param.name}}`, parameters[param.name]);
                }
            });
        }

        // Build query parameters
        const queryParams = {};
        if (endpoint.parameters) {
            endpoint.parameters.forEach(param => {
                if (param.in === 'query' && parameters[param.name]) {
                    queryParams[param.name] = parameters[param.name];
                }
            });
        }

        // Build headers
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        // Add header parameters
        if (endpoint.parameters) {
            endpoint.parameters.forEach(param => {
                if (param.in === 'header' && parameters[param.name]) {
                    headers[param.name] = parameters[param.name];
                }
            });
        }

        // Build request body
        let data = null;
        if (['POST', 'PUT', 'PATCH'].includes(endpoint.method.toUpperCase())) {
            // Extract body parameters
            const bodyParams = {};
            if (endpoint.requestBody && endpoint.requestBody.schema) {
                // Use provided parameters for body
                Object.keys(parameters).forEach(key => {
                    // Skip path, query, header params
                    const isPathParam = endpoint.parameters?.some(p => p.in === 'path' && p.name === key);
                    const isQueryParam = endpoint.parameters?.some(p => p.in === 'query' && p.name === key);
                    const isHeaderParam = endpoint.parameters?.some(p => p.in === 'header' && p.name === key);

                    if (!isPathParam && !isQueryParam && !isHeaderParam) {
                        bodyParams[key] = parameters[key];
                    }
                });
            }
            data = bodyParams;
        }

        return {
            method: endpoint.method.toUpperCase(),
            url,
            params: queryParams,
            headers,
            data
        };
    }
}

export default new ApiExecutorService();
