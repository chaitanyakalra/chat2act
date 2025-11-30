/**
 * Chatbot Controller
 * Handles webhook events with 5-second timeout optimization and proactive messaging
 */

import greetingService from "../services/greetingService.js";
import ragOrchestrationService from "../services/ragOrchestrationService.js";
import redisSessionService from "../services/redisSessionService.js";
import salesiqMessageService from "../services/salesiqMessageService.js";
import Conversation from "../models/Conversation.js";

class ChatbotController {
    constructor() {
        this.processedRequests = new Set();
        this.processingLock = new Map(); // Lock to prevent concurrent processing
        this.handleWebhook = this.handleWebhook.bind(this);
    }

    /**
     * Handle incoming webhook from SalesIQ
     */
    async handleWebhook(req, res) {
        const startTime = Date.now();

        try {
            const payload = req.body;

            // Handle SalesIQ validation ping (but not trigger events)
            if (payload.handler === 'ping' || (!payload.handler && !payload.message)) {
                console.log('🏓 Validation ping detected, responding immediately');
                return res.status(200).json({ status: 'ok' });
            }

            // Deduplication: Check if we've already processed this request ID
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
            const orgId = payload.org_id;
            const visitorId = payload.visitor?.email || payload.visitor?.active_conversation_id;

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

                // 3. Dynamic Parameter Extraction
                // CLEANER APPROACH: Only extract custom_info and essential fields
                const sessionParams = {
                    // Custom Parameters (Flattened for easy access)
                    ...tempCustomParams,                 // From direct API call (priority)
                    ...payload.visitor?.custom_info,     // From Zoho (if configured)
                    ...payload.visitor?.info,            // Fallback
                    ...payload.session?.variables,       // Zobot variables

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

                console.log(`🤖 Response: "${greeting}"`);
                console.log(`⏱️  Response time: ${Date.now() - startTime}ms\n`);

                return res.json({
                    replies: [{ text: greeting }]
                });
            }

            // Handle message event (user sent a text message)
            // Process ALL text messages regardless of operation type (chat, message, etc.)
            if (handler === "message" && payload.message?.type === "text") {
                console.log("🎯 EVENT: User Message");
                console.log(`👤 Visitor: ${visitorEmail}`);
                console.log(`💬 Message: "${userMessage}"`);

                // Check for pending reply text (from failed proactive send)
                const conversation = await Conversation.findOne({ visitorId, orgId });
                if (conversation?.pendingReplyText) {
                    console.log('📬 Found pending reply text, returning it immediately');
                    const reply = conversation.pendingReplyText;
                    conversation.pendingReplyText = null;
                    await conversation.save();

                    console.log(`🤖 Response: "${reply}"`);
                    console.log(`⏱️  Response time: ${Date.now() - startTime}ms\n`);

                    return res.json({
                        replies: [{ text: reply }]
                    });
                }

                // Check for concurrent processing lock
                const conversationKey = `${orgId}_${visitorId}`;

                if (this.processingLock.has(conversationKey)) {
                    console.log(`🔒 Already processing message for ${conversationKey}`);
                    console.log(`⏱️  Response time: ${Date.now() - startTime}ms\n`);
                    return res.json({
                        replies: [{ text: "Please wait, I'm still processing your previous message..." }]
                    });
                }

                // Set processing lock
                this.processingLock.set(conversationKey, true);
                console.log(`🔓 Acquired processing lock for ${conversationKey}`);

                try {
                    // Start the full RAG pipeline (non-blocking)
                    console.log("\n🧠 Starting RAG Orchestration Pipeline...");
                    const pipelinePromise = ragOrchestrationService.processMessage(
                        userMessage,
                        payload
                    );

                    // Create a 4-second timeout promise
                    const timeoutPromise = new Promise(resolve => {
                        setTimeout(() => {
                            console.log('⏰ 4-second timeout reached');
                            resolve({ timeout: true });
                        }, 4000);
                    });

                    // Race between pipeline and timeout
                    console.log('🏁 Racing pipeline vs 4s timeout...');
                    const result = await Promise.race([pipelinePromise, timeoutPromise]);

                    if (result.timeout) {
                        // Timeout won - return "working on it" message
                        console.log('⏱️  Pipeline exceeded 4s, returning interim message');

                        // Continue pipeline in background
                        pipelinePromise
                            .then(async (finalResult) => {
                                console.log('✅ Background pipeline completed successfully');
                                console.log(`📝 Final result: "${finalResult}"`);

                                // Try to send proactive message
                                const conv = await Conversation.findOne({ visitorId, orgId });
                                if (conv && conv.activeConversationId && conv.screenName) {
                                    console.log('📤 Attempting proactive message send...');

                                    const result = await salesiqMessageService.sendOperatorMessage({
                                        conversationId: conv.activeConversationId,
                                        text: finalResult,
                                        screenName: conv.screenName
                                    });

                                    if (!result.success) {
                                        console.log('⚠️  Proactive send failed, storing as pendingReplyText');
                                        conv.pendingReplyText = finalResult;
                                        await conv.save();
                                    }
                                } else {
                                    console.log('⚠️  Missing conversation metadata, storing as pendingReplyText');
                                    if (conv) {
                                        conv.pendingReplyText = finalResult;
                                        await conv.save();
                                    }
                                }
                            })
                            .catch(err => {
                                console.error('❌ Background pipeline error:', err);
                            })
                            .finally(() => {
                                this.processingLock.delete(conversationKey);
                                console.log(`🔓 Released processing lock for ${conversationKey}`);
                            });

                        const interimMessage = "I'm working on it, give me a moment...";
                        console.log(`🤖 Response: "${interimMessage}"`);
                        console.log(`⏱️  Response time: ${Date.now() - startTime}ms\n`);

                        return res.json({
                            replies: [{ text: interimMessage }]
                        });
                    } else {
                        // Pipeline completed in time!
                        console.log(`✅ Pipeline completed within 4s`);
                        console.log(`🤖 Response: "${result}"`);
                        console.log(`⏱️  Response time: ${Date.now() - startTime}ms\n`);

                        return res.json({
                            replies: [{ text: result }]
                        });
                    }
                } finally {
                    // Release lock if pipeline completed in time
                    if (!this.processingLock.has(conversationKey)) {
                        // Already released in background continuation
                    } else {
                        this.processingLock.delete(conversationKey);
                        console.log(`🔓 Released processing lock for ${conversationKey}`);
                    }
                }
            }

            // Unhandled event type
            console.log("⚠️  Unhandled event type");
            console.log(`⏱️  Response time: ${Date.now() - startTime}ms\n`);
            res.json({
                replies: [{ text: "I received your message." }]
            });

        } catch (error) {
            console.error("\n❌ ERROR in webhook handler:");
            console.error(error);
            console.error(`⏱️  Response time: ${Date.now() - startTime}ms\n`);

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
