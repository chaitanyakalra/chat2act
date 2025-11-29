/**
 * RAG Orchestration Service
 * Coordinates vector search, LLM decision-making, and API execution
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import Conversation from '../models/Conversation.js';
import ApiIndex from '../models/ApiIndex.js';
import greetingService from './greetingService.js';
import { VectorDbService } from './vectorDbService.js';
import apiExecutorService from './apiExecutorService.js';
import parameterResolverService from './parameterResolverService.js';

export class RagOrchestrationService {
    constructor() {
        this.genAI = null;
        this.model = null;
        this.vectorDbService = new VectorDbService();
        this.confidenceThreshold = 0.8;
        this.maxClarificationAttempts = 2;
    }

    _init() {
        if (!this.model) {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        }
    }

    /**
     * Main entry point - process user message
     * @param {String} userMessage - The user's message
     * @param {Object} webhookPayload - Full SalesIQ webhook payload
     * @returns {Promise<String>} Bot response
     */
    async processMessage(userMessage, webhookPayload) {
        try {
            const visitorId = webhookPayload.visitor?.email || webhookPayload.visitor?.active_conversation_id;
            const orgId = webhookPayload.org_id;
            const activeConversationId = webhookPayload.visitor?.active_conversation_id;

            if (!visitorId || !orgId) {
                console.error('Missing visitorId or orgId from webhook');
                return "Sorry, I'm having trouble identifying you. Please try again.";
            }

            console.log(`\n🎯 Processing message for visitor: ${visitorId}, org: ${orgId}`);

            // 1. Get or create conversation
            let conversation = await Conversation.findOne({ visitorId, orgId });

            if (!conversation) {
                console.log('📝 Creating new conversation');
                conversation = new Conversation({
                    visitorId,
                    activeConversationId,
                    orgId,
                    userDetails: {
                        email: webhookPayload.visitor?.email,
                        country: webhookPayload.visitor?.country,
                        countryCode: webhookPayload.visitor?.country_code,
                        os: webhookPayload.visitor?.os,
                        departmentId: webhookPayload.visitor?.department_id,
                        channel: webhookPayload.visitor?.channel,
                        language: webhookPayload.visitor?.language,
                        timeZone: webhookPayload.visitor?.time_zone
                    },
                    requestInfo: {
                        appId: webhookPayload.request?.app_id,
                        requestId: webhookPayload.request?.id
                    }
                });
                await conversation.save();
            }

            // 2. Check if message is a greeting/small talk
            if (this.isGreeting(userMessage)) {
                console.log('👋 Detected greeting, skipping vector search');
                const greeting = await greetingService.generateGreeting();
                await conversation.addMessage('user', userMessage);
                await conversation.addMessage('bot', greeting);
                return greeting;
            }

            // 3. Get conversation history
            const conversationHistory = conversation.getLastNTurns(2);
            console.log('📜 Chat history:', conversationHistory);

            // 4. Get active API index for this org
            const apiIndex = await this.getActiveApiIndex(orgId);
            if (!apiIndex) {
                console.log('⚠️  No active API documentation for this org');
                const response = "I don't have any API documentation configured yet. Please upload your API spec first.";
                await conversation.addMessage('user', userMessage);
                await conversation.addMessage('bot', response);
                return response;
            }

            // 5. Perform vector search
            console.log('🔍 Performing vector search...');
            const candidates = await this.performVectorSearch(
                userMessage,
                conversationHistory,
                orgId,
                apiIndex._id
            );

            if (candidates.length === 0) {
                console.log('❌ No matching endpoints found');
                const response = "I didn't find a matching action for that—can you rephrase or try something else?";
                await conversation.addMessage('user', userMessage);
                await conversation.addMessage('bot', response);
                await conversation.resetClarificationAttempts();
                return response;
            }

            console.log(`✅ Found ${candidates.length} candidate endpoints`);

            // 6. Let Gemini decide which endpoint to call
            const decision = await this.decideEndpoint(
                userMessage,
                conversationHistory,
                candidates
            );

            console.log('🤖 Gemini decision:', decision);

            // 7. Handle decision
            const response = await this.handleDecision(
                decision,
                conversation,
                orgId,
                apiIndex._id
            );

            // 8. Save to conversation
            await conversation.addMessage('user', userMessage);
            await conversation.addMessage('bot', response);

            return response;

        } catch (error) {
            console.error('❌ Error in RAG orchestration:', error);
            return "Sorry, something went wrong. Please try again.";
        }
    }

    /**
     * Check if message is a greeting
     */
    isGreeting(message) {
        const greetings = [
            'hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon',
            'good evening', 'howdy', 'sup', 'yo', "what's up", 'whats up'
        ];

        const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does'];

        const lowerMessage = message.toLowerCase().trim();

        // If message contains question words, it's NOT just a greeting
        if (questionWords.some(q => lowerMessage.includes(` ${q} `) || lowerMessage.includes(`${q} `))) {
            return false;
        }

        // Check if whole message is exactly a greeting (short message)
        if (lowerMessage.length < 20 && greetings.includes(lowerMessage)) {
            return true;
        }

        // Check if message starts with greeting but is short (likely just greeting)
        const startsWithGreeting = greetings.some(g =>
            lowerMessage.startsWith(g + ' ') ||
            lowerMessage.startsWith(g + ',') ||
            lowerMessage === g
        );

        // Only treat as greeting if it's short and starts with greeting
        if (startsWithGreeting && lowerMessage.length < 20) {
            return true;
        }

        return false;
    }

    /**
     * Get active API index for organization
     */
    async getActiveApiIndex(orgId) {
        // Find the most recent API index for this org
        const apiIndex = await ApiIndex.findOne({ zohoOrgId: orgId })
            .sort({ createdAt: -1 })
            .limit(1);

        return apiIndex;
    }

    /**
     * Perform vector search with chat history
     */
    async performVectorSearch(userMessage, conversationHistory, orgId, apiIndexId) {
        try {
            // Combine user message with recent history for better context
            let searchQuery = userMessage;
            if (conversationHistory) {
                searchQuery = `${conversationHistory}\nuser: ${userMessage}`;
            }

            // Search in Pinecone using namespace = orgId
            const results = await this.vectorDbService.searchChunks(
                searchQuery,
                apiIndexId,
                orgId,  //namespace
                5       // top 5 candidates
            );

            // Extract unique endpoint IDs from results
            const endpointIds = [...new Set(results.map(r => r.endpointId).filter(Boolean))];

            // Fetch full endpoint specs
            const apiIndex = await ApiIndex.findById(apiIndexId);
            const candidates = apiIndex.endpoints.filter(ep =>
                endpointIds.includes(ep.endpointId)
            );

            // Attach relevance scores
            return candidates.map(endpoint => {
                const relevantChunks = results.filter(r => r.endpointId === endpoint.endpointId);
                const avgScore = relevantChunks.reduce((sum, r) => sum + r.score, 0) / relevantChunks.length;

                return {
                    endpoint,
                    score: avgScore,
                    matchedChunks: relevantChunks.length
                };
            }).sort((a, b) => b.score - a.score).slice(0, 5);

        } catch (error) {
            console.error('Error in vector search:', error);
            return [];
        }
    }

    /**
     * Let Gemini decide which endpoint to call
     */
    async decideEndpoint(userMessage, conversationHistory, candidates) {
        try {
            this._init();

            const prompt = this.buildDecisionPrompt(userMessage, conversationHistory, candidates);

            const response = await this.model.generateContent(prompt);
            const text = response.response.text();

            // Parse JSON response
            let jsonText = text.trim();
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
            }

            const decision = JSON.parse(jsonText);
            return decision;

        } catch (error) {
            console.error('Error in Gemini decision:', error);
            return {
                call_api: false,
                confidence: 0,
                reasoning: 'Error during decision making'
            };
        }
    }

    /**
     * Build decision prompt for Gemini
     */
    buildDecisionPrompt(userMessage, conversationHistory, candidates) {
        const endpointTable = candidates.map((c, idx) => {
            const ep = c.endpoint;
            return `${idx + 1}. ${ep.method} ${ep.path}
   ID: ${ep.endpointId}
   Description: ${ep.summary || ep.description || 'No description'}
   Required params: ${ep.parameters?.filter(p => p.required).map(p => p.name).join(', ') || 'None'}
   Score: ${c.score.toFixed(3)}`;
        }).join('\n\n');

        return `You are an API decision agent. Analyze the user's message and decide whether to call an API endpoint.

CONVERSATION HISTORY:
${conversationHistory || 'None'}

USER MESSAGE:
"${userMessage}"

TOP CANDIDATE ENDPOINTS:
${endpointTable}

YOUR TASK:
1. Decide if the user wants to perform an API action
2. If yes, select the MOST APPROPRIATE endpoint from the candidates above
3. Extract ALL required parameters from the user message
4. Identify any MISSING required parameters
5. Provide a confidence score (0.0 to 1.0)

RESPOND IN THIS EXACT JSON FORMAT:
{
  "call_api": true/false,
  "endpoint_id": "endpoint_id_here" or null,
  "parameters": {
    "param_name": "value"
  },
  "missing_parameters": ["param_name"],
  "clarification_question": "Question to ask user if params are missing or confidence is low",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

IMPORTANT:
- If required parameters are missing, set 'call_api' to true but list them in 'missing_parameters'.
- In 'clarification_question', ask specifically for the missing information (e.g., "Could you provide your User ID?").
- Set call_api to false if the user is just asking questions or chatting.
- Confidence should reflect how certain you are about the match, NOT whether you have all params.

Only respond with valid JSON, no markdown formatting.`;
    }

    /**
     * Handle Gemini's decision
     */
    async handleDecision(decision, conversation, orgId, apiIndexId) {
        // Case 1: No API call needed
        if (!decision.call_api) {
            await conversation.resetClarificationAttempts();
            return "I understand you're asking a question. How can I help you with that?";
        }

        // Case 2: Missing parameters - try to auto-resolve first
        if (decision.missing_parameters && decision.missing_parameters.length > 0) {
            console.log(`❓ Missing parameters: ${decision.missing_parameters.join(', ')}`);

            // Try to auto-resolve userId
            if (decision.missing_parameters.includes('userId')) {
                const email = conversation.userDetails?.email;

                if (email) {
                    console.log('🔄 Attempting to auto-resolve userId from email...');
                    const resolvedUserId = await parameterResolverService.tryResolveUserId({
                        orgId,
                        email,
                        conversation,
                        apiIndexId
                    });

                    if (resolvedUserId) {
                        // Success! Add to parameters and remove from missing list
                        decision.parameters.userId = resolvedUserId;
                        decision.missing_parameters = decision.missing_parameters.filter(p => p !== 'userId');
                        console.log(`✅ Auto-resolved userId: ${resolvedUserId}`);
                    }
                }
            }

            // If still have missing parameters after auto-resolution, ask user
            if (decision.missing_parameters.length > 0) {
                await conversation.incrementClarificationAttempts();
                return decision.clarification_question || `I can help with that, but I need a bit more info. Could you provide your ${decision.missing_parameters.join(' and ')}?`;
            }

            // All parameters resolved! Fall through to execute API
        }

        // Case 3: High confidence - execute API
        if (decision.confidence >= this.confidenceThreshold) {
            console.log(`✨ High confidence (${decision.confidence}), executing API...`);
            await conversation.resetClarificationAttempts();

            const result = await apiExecutorService.executeApiCall(
                decision.endpoint_id,
                decision.parameters,
                orgId,
                apiIndexId
            );

            if (result.success) {
                return `Great! I executed ${result.endpoint} successfully. ${this.formatApiResponse(result.data)}`;
            } else {
                return result.message; // User-friendly error
            }
        }

        // Case 4: Low confidence - clarify
        if (conversation.clarificationAttempts < this.maxClarificationAttempts) {
            await conversation.incrementClarificationAttempts();
            return decision.clarification_question || `I think you want to ${decision.reasoning}, but I'm not entirely sure. Can you please clarify?`;
        }

        // Case 5: Too many clarification attempts - fallback
        await conversation.resetClarificationAttempts();
        return "I'm having trouble understanding exactly what you need. Could you try rephrasing your request more specifically?";
    }

    /**
     * Format API response for user
     */
    formatApiResponse(data) {
        if (!data) return '';

        // Simple formatting - can be enhanced
        if (typeof data === 'object') {
            if (Array.isArray(data)) {
                return `Found ${data.length} result(s).`;
            }
            return "Here's what I found.";
        }

        return String(data);
    }
}

export default new RagOrchestrationService();
