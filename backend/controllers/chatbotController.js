/**
 * Chatbot Controller
 * Handles webhook events and RAG-based orchestration
 */

import greetingService from "../services/greetingService.js";
import ragOrchestrationService from "../services/ragOrchestrationService.js";
import redisSessionService from "../services/redisSessionService.js";

class ChatbotController {
    constructor() {
        this.processedRequests = new Set();
        this.handleWebhook = this.handleWebhook.bind(this);
    }

    /**
     * Handle incoming webhook from SalesIQ
     */
    async handleWebhook(req, res) {
        try {
            const payload = req.body;

            // Deduplication: Check if we've already processed this request ID
            // SalesIQ sends a unique 'id' in the request object
            const requestId = payload.request?.id || payload.unique_id;

            if (requestId && this.processedRequests.has(requestId)) {
                console.log(`⚠️ Duplicate request detected (${requestId}), skipping...`);
                return res.status(200).json({});
            }

            // Add to processed set and clear after 1 minute
            if (requestId) {
                this.processedRequests.add(requestId);
                setTimeout(() => this.processedRequests.delete(requestId), 60000);
            }

            console.log("\n" + "=".repeat(60));
            console.log("📨 INCOMING WEBHOOK");
            console.log("=".repeat(60));
            console.log(JSON.stringify(payload, null, 2));
            console.log("=".repeat(60) + "\n");

            const handler = payload.handler;
            const userMessage = payload.message?.text;
            const visitorEmail = payload.visitor?.email || "anonymous";

            // Handle trigger event (bot opened)
            if (handler === "trigger") {
                console.log("🎯 EVENT: Bot Opened (trigger)");
                console.log(`👤 Visitor: ${visitorEmail}`);

                // 1. Extract Org ID from root
                const orgId = payload.org_id;

                // 2. Extract Visitor ID (Use Email as Unique Key)
                const visitorId = payload.visitor?.email || payload.visitor?.email_id;

                // 2.5 Retrieve temporarily stored custom params (from direct API call)
                let tempCustomParams = {};
                if (visitorId && redisSessionService.redis) {
                    const tempKey = `temp_session:${visitorId}`;
                    try {
                        const tempData = await redisSessionService.redis.get(tempKey);
                        if (tempData) {
                            tempCustomParams = JSON.parse(tempData);
                            console.log(`🔄 Retrieved temp params for ${visitorId}:`, tempCustomParams);
                            // Don't delete temp key - allow multiple chat sessions without page refresh
                        }
                    } catch (e) {
                        console.warn('⚠️  Failed to retrieve temp params:', e.message);
                    }
                }

                // 2.6 Check if permanent session already exists (for subsequent chats)
                let existingParams = {};
                if (visitorId && orgId) {
                    existingParams = await redisSessionService.getSession(visitorId, orgId) || {};
                    if (Object.keys(existingParams).length > 1) { // More than just orgId
                        console.log(`♻️  Found existing session params for ${visitorId}`);
                    }
                }

                // 3. Dynamic Parameter Extraction
                // Priority: existing params > temp params > payload params
                const sessionParams = {
                    // Start with existing params (from previous chat)
                    ...existingParams,
                    // Override with temp params if available (from page load)
                    ...tempCustomParams,
                    // Override with any new params from Zoho
                    ...payload.visitor?.custom_info,
                    ...payload.visitor?.info,
                    ...payload.session?.variables,

                    // System
                    orgId: orgId
                };

                // Remove standard Zoho fields from sessionParams if they pollute the custom data
                delete sessionParams.type;
                delete sessionParams.platform;

                if (visitorId && orgId) {
                    console.log(`💾 Storing dynamic session params for ${visitorId} @ ${orgId}`);
                    console.log(`   Params: ${JSON.stringify(sessionParams)}`);

                    // Store with composite key for safety
                    await redisSessionService.storeSession(
                        visitorId,
                        sessionParams,
                        payload.chat?.chatId,
                        null, // default TTL
                        orgId // Pass orgId for namespacing
                    );
                } else {
                    console.warn('⚠️  Missing visitor.id or org_id in trigger payload');
                }

                const greeting = await greetingService.generateGreeting();
                return res.json({ replies: [{ text: greeting }] });
            }

            // Handle message event (user sent a message)
            if (handler === "message" && payload.operation === "chat") {
                console.log("🎯 EVENT: User Message");

                const orgId = payload.org_id;
                // Use Email as Unique Key (same as trigger)
                const visitorId = payload.visitor?.email || payload.visitor?.email_id;

                let cachedParams = {};

                if (visitorId && orgId) {
                    // Retrieve using the same composite logic
                    cachedParams = await redisSessionService.getSession(visitorId, orgId) || {};
                    console.log(`🔍 Retrieved cached params: ${Object.keys(cachedParams).join(', ')}`);
                }

                // Dynamic Enrichment: Merge payload params with cached params
                // Payload params take precedence if they are newer updates
                const currentSessionParams = payload.session || {};

                const enrichedPayload = {
                    ...payload,
                    // Create a consolidated 'context' object for the RAG service
                    context: {
                        ...cachedParams,
                        ...currentSessionParams,
                        orgId: orgId
                    },
                    // Keep backward compatibility for specific fields if RAG service expects them at root
                    orgId: orgId,
                    visitor: {
                        ...payload.visitor,
                        params: { ...cachedParams, ...currentSessionParams }
                    }
                };

                // Pass to RAG orchestration
                const response = await ragOrchestrationService.processMessage(
                    userMessage,
                    enrichedPayload
                );

                return res.json({ replies: [{ text: response }] });
            }

            // Unhandled event type
            console.log("⚠️  Unhandled event type");
            res.json({
                replies: [{ text: "I received your message." }]
            });

        } catch (error) {
            console.error("\n❌ ERROR in webhook handler:");
            console.error(error);
            console.error("\n");

            res.status(500).json({
                replies: [{ text: "Sorry, something went wrong. Please try again." }]
            });
        }
    }

    /**
     * Store session parameters directly from frontend (bypasses Zoho)
     * Frontend sends only custom_params + email
     * These are stored temporarily until the trigger event provides org_id
     */
    async storeSessionParams(req, res) {
        try {
            const { email, custom_params } = req.body;

            // Validation
            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'email is required'
                });
            }

            console.log(`📥 Direct session params received for ${email}`);
            console.log(`   Params: ${JSON.stringify(custom_params)}`);

            // Store temporarily with email as key (will be re-stored with org_id in trigger event)
            // Using a temporary key format: temp_session:{email}
            const tempKey = `temp_session:${email}`;

            if (redisSessionService.redis) {
                await redisSessionService.redis.setex(tempKey, 300, JSON.stringify(custom_params)); // 5 min TTL
                console.log(`✅ Temporarily stored params with key: ${tempKey}`);
            } else {
                console.warn('⚠️  Redis not available, params not stored');
            }

            res.json({ success: true });

        } catch (error) {
            console.error('❌ Error storing session params:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

export default new ChatbotController();
