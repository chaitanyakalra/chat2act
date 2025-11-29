/**
 * Parameter Resolver Service
 * Auto-resolves missing parameters by calling resolver endpoints
 */

import ApiIndex from '../models/ApiIndex.js';
import { VectorDbService } from './vectorDbService.js';
import apiExecutorService from './apiExecutorService.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class ParameterResolverService {
    constructor() {
        this.genAI = null;
        this.model = null;
        this.vectorDbService = new VectorDbService();
    }

    _init() {
        if (!this.model) {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        }
    }

    /**
     * Try to resolve userId from email
     * @param {Object} params - { orgId, email, conversation, apiIndexId }
     * @returns {Promise<String|null>} Resolved userId or null
     */
    async tryResolveUserId({ orgId, email, conversation, apiIndexId }) {
        try {
            console.log(`🔍 Attempting to auto-resolve userId for email: ${email}`);

            // 1. Check cache first
            if (conversation.resolvedParameters && conversation.resolvedParameters.get('userId')) {
                console.log('✅ Found cached userId');
                return conversation.resolvedParameters.get('userId');
            }

            // 2. Find resolver endpoint using vector search
            const resolverEndpoint = await this.findResolverEndpoint({
                orgId,
                apiIndexId,
                resolverType: 'user_by_email'
            });

            if (!resolverEndpoint) {
                console.log('❌ No resolver endpoint found');
                return null;
            }

            console.log(`📞 Calling resolver: ${resolverEndpoint.method} ${resolverEndpoint.path}`);

            // 3. Call the resolver endpoint
            const result = await apiExecutorService.executeApiCall(
                resolverEndpoint.endpointId,
                { email },  // Pass email as parameter
                orgId,
                apiIndexId
            );

            if (!result.success) {
                console.log('❌ Resolver API call failed');
                return null;
            }

            // 4. Extract userId from response
            const userId = this.extractUserId(result.data);

            if (userId) {
                console.log(`✅ Resolved userId: ${userId}`);

                // 5. Cache it
                if (!conversation.resolvedParameters) {
                    conversation.resolvedParameters = new Map();
                }
                conversation.resolvedParameters.set('userId', userId);
                await conversation.save();

                return userId;
            }

            console.log('❌ Could not extract userId from response');
            return null;

        } catch (error) {
            console.error('Error in userId resolution:', error);
            return null;
        }
    }

    /**
     * Find a resolver endpoint (e.g., "Get user by email")
     */
    async findResolverEndpoint({ orgId, apiIndexId, resolverType }) {
        try {
            // Build search query based on resolver type
            let searchQuery;
            if (resolverType === 'user_by_email') {
                searchQuery = 'Get user profile by email address, find customer by email';
            }

            // Vector search
            const results = await this.vectorDbService.searchChunks(
                searchQuery,
                apiIndexId,
                orgId,
                3  // top 3 candidates
            );

            if (results.length === 0) {
                return null;
            }

            // Get endpoint specs
            const apiIndex = await ApiIndex.findById(apiIndexId);
            const endpointIds = [...new Set(results.map(r => r.endpointId).filter(Boolean))];
            const candidates = apiIndex.endpoints.filter(ep =>
                endpointIds.includes(ep.endpointId)
            );

            if (candidates.length === 0) {
                return null;
            }

            // Ask Gemini to pick the best resolver
            this._init();
            const prompt = this.buildResolverSelectionPrompt(candidates);
            const response = await this.model.generateContent(prompt);
            const text = response.response.text();

            let jsonText = text.trim();
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
            }

            const decision = JSON.parse(jsonText);

            if (decision.is_resolver && decision.endpoint_id) {
                return candidates.find(c => c.endpointId === decision.endpoint_id);
            }

            return null;

        } catch (error) {
            console.error('Error finding resolver endpoint:', error);
            return null;
        }
    }

    /**
     * Build prompt for Gemini to select resolver endpoint
     */
    buildResolverSelectionPrompt(candidates) {
        const endpointTable = candidates.map((ep, idx) => {
            return `${idx + 1}. ${ep.method} ${ep.path}
   ID: ${ep.endpointId}
   Description: ${ep.summary || ep.description || 'No description'}
   Parameters: ${ep.parameters?.map(p => `${p.name}${p.required ? '*' : ''}`).join(', ') || 'None'}`;
        }).join('\n\n');

        return `You are selecting an endpoint that can RESOLVE a user's identity BY EMAIL.

CANDIDATE ENDPOINTS:
${endpointTable}

YOUR TASK:
Select the endpoint that:
1. Accepts "email" as a parameter
2. Returns user profile or user details
3. Will likely contain "userId" or "id" in the response

RESPOND IN THIS EXACT JSON FORMAT:
{
  "is_resolver": true/false,
  "endpoint_id": "endpoint_id_here" or null,
  "reasoning": "brief explanation"
}

IMPORTANT:
- Set is_resolver to true ONLY if you're confident this endpoint can resolve user identity by email.
- If none of the endpoints match, set is_resolver to false.

Only respond with valid JSON, no markdown formatting.`;
    }

    /**
     * Extract userId from API response
     */
    extractUserId(data) {
        if (!data) return null;

        // Handle various response structures
        if (typeof data === 'string') {
            return data;
        }

        if (typeof data === 'object') {
            // Common field names for user ID
            const possibleFields = [
                'userId', 'user_id', 'id', 'ID',
                'customerId', 'customer_id',
                'uuid', 'UUID',
                'uid', 'UID'
            ];

            // Check direct fields
            for (const field of possibleFields) {
                if (data[field]) {
                    return String(data[field]);
                }
            }

            // Check nested user/customer object
            if (data.user) {
                for (const field of possibleFields) {
                    if (data.user[field]) {
                        return String(data.user[field]);
                    }
                }
            }

            if (data.customer) {
                for (const field of possibleFields) {
                    if (data.customer[field]) {
                        return String(data.customer[field]);
                    }
                }
            }

            // Check if it's an array with first element
            if (Array.isArray(data) && data.length > 0) {
                return this.extractUserId(data[0]);
            }
        }

        return null;
    }
}

export default new ParameterResolverService();
