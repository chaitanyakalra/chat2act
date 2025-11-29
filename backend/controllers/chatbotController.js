/**
 * Chatbot Controller
 * Handles webhook events and RAG-based orchestration
 */

import greetingService from "../services/greetingService.js";
import ragOrchestrationService from "../services/ragOrchestrationService.js";

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

                const greeting = await greetingService.generateGreeting();

                console.log(`🤖 Response: "${greeting}"\n`);

                return res.json({
                    replies: [{ text: greeting }]
                });
            }

            // Handle message event (user sent a message)
            if (handler === "message" && payload.operation === "chat") {
                console.log("🎯 EVENT: User Message");
                console.log(`👤 Visitor: ${visitorEmail}`);
                console.log(`💬 Message: "${userMessage}"`);

                // Use RAG orchestration for intelligent routing
                console.log("\n🧠 Starting RAG Orchestration...");
                const response = await ragOrchestrationService.processMessage(
                    userMessage,
                    payload
                );

                console.log(`🤖 Response: "${response}"\n`);

                return res.json({
                    replies: [{ text: response }]
                });
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
}

export default new ChatbotController();
