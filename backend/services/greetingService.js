/**
 * Greeting Service
 * Generates dynamic greetings using Gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

class GreetingService {
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
     * Generate a unique greeting message
     * @returns {Promise<String>} Greeting message
     */
    async generateGreeting() {
        try {
            const prompt = `Generate ONE friendly, professional, and unique greeting message for a SaaS platform chatbot assistant. 
The greeting should:
- Be warm, welcoming, and professional
- Be different each time (creative and varied)
- Mention that the bot is here to assist with any questions, account management, or platform navigation
- Be 1-2 sentences maximum
- Sound natural, helpful, and conversational
- NOT mention specific features like "orders" unless they are universally applicable to SaaS

IMPORTANT: Provide ONLY ONE greeting option. Do not list multiple options. Just the single greeting text.`;

            this._init();
            const response = await this.model.generateContent(prompt);
            const greeting = response.response.text().trim();

            return greeting;

        } catch (error) {
            console.error("⚠️  Error generating greeting:", error.message);
            // Fallback greeting
            return "Hi there! I'm here to help you navigate the platform and answer any questions you may have. How can I assist you today?";
        }
    }
}

export default new GreetingService();
