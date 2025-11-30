/**
 * NLP Service
 * Performs intent classification using Gemini AI
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

class NLPService {
    constructor() {
        this.model = null;
        this.genAI = null;
    }

    _init() {
        if (!this.model) {
            if (!process.env.GEMINI_API_KEY) {
                console.error("❌ GEMINI_API_KEY is missing from environment variables");
            }
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        }
    }

    /**
     * Classify user intent using Gemini
     * @param {String} userMessage - The user's message
     * @returns {Promise<Object>} { intentId, parameters, confidence, reasoning }
     */
    async classifyIntent(userMessage) {
        try {
            const startTime = Date.now();
            console.log("   🔄 Calling Gemini AI...");

            this._init();
            const prompt = this._buildPrompt(userMessage);
            const response = await this.model.generateContent(prompt);
            const text = response.response.text();

            const duration = Date.now() - startTime;
            console.log(`   ✅ Gemini response received (${duration}ms)`);
            console.log(`   📝 Raw response: ${text.substring(0, 200)}...`);

            const result = this._parseResponse(text);
            return result;

        } catch (error) {
            console.error("   ❌ Error in NLP classification:", error.message);
            return {
                intentId: null,
                parameters: {},
                confidence: 0,
                reasoning: "Error during classification"
            };
        }
    }

    /**
     * Build classification prompt
     * @private
     */
    _buildPrompt(userMessage) {
        return `You are an intent classification AI for a conversational chatbot.

USER MESSAGE:
"${userMessage}"

AVAILABLE INTENTS:
- get_orders: User wants to view their orders (parameters: date_range, status)
- get_profile: User wants to see their profile information
- update_settings: User wants to change account settings (parameters: setting_name, value)
- get_help: User needs help or has a question
- greeting: User is greeting or saying hello
- other: None of the above intents match

YOUR TASK:
Analyze the user's message and determine:
1. Which intent best matches (or "other" if none match)
2. Extract any parameters mentioned
3. Provide a confidence score (0.0 to 1.0)
4. Brief reasoning for your classification

RESPOND IN THIS EXACT JSON FORMAT:
{
  "intentId": "intent_name or null",
  "parameters": {
    "param_name": "value"
  },
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Only respond with valid JSON, no markdown formatting.`;
    }

    /**
     * Parse Gemini's response
     * @private
     */
    _parseResponse(text) {
        try {
            // Remove markdown code blocks if present
            let jsonText = text.trim();
            if (jsonText.startsWith('```')) {
                jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?/g, '');
            }

            const parsed = JSON.parse(jsonText);

            return {
                intentId: parsed.intentId || null,
                parameters: parsed.parameters || {},
                confidence: parsed.confidence || 0,
                reasoning: parsed.reasoning || ""
            };
        } catch (error) {
            console.error("   ⚠️  Failed to parse Gemini response:", error.message);
            return {
                intentId: null,
                parameters: {},
                confidence: 0,
                reasoning: "Parse error"
            };
        }
    }
}

export default new NLPService();
