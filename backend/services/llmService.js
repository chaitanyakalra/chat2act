/**
 * LLM Service for generating business tags and intent mappings
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

export class LLMService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    }

    /**
     * Generate business tags for endpoints
     */
    async generateBusinessTags(endpoints) {
        try {
            const systemPrompt = "You are an API documentation expert. Generate concise, business-oriented tags that describe what each endpoint does in plain language. Always return valid JSON only.";
            const userPrompt = this.buildTagGenerationPrompt(endpoints);
            const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

            const result = await this.model.generateContent(fullPrompt);
            const response = await result.response;
            const text = response.text();

            // Extract JSON from response (Gemini sometimes adds markdown formatting)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonText = jsonMatch ? jsonMatch[0] : text;
            const parsed = JSON.parse(jsonText);

            return parsed.tags || {};
        } catch (error) {
            console.error('Error generating business tags:', error);
            // Fallback: generate simple tags from endpoint info
            return this.generateFallbackTags(endpoints);
        }
    }

    /**
     * Generate intent mappings from API endpoints
     */
    async generateIntentMappings(endpoints, apiMetadata) {
        try {
            const systemPrompt = "You are an API documentation expert. Analyze endpoints and create high-level intents that map user queries to API endpoints. Generate structured intent mappings with sub-intents, parameter mappings, and example queries. Always return valid JSON only.";
            const userPrompt = this.buildIntentMappingPrompt(endpoints, apiMetadata);
            const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

            const result = await this.model.generateContent(fullPrompt);
            const response = await result.response;
            const text = response.text();

            // Extract JSON from response (Gemini sometimes adds markdown formatting)
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            const jsonText = jsonMatch ? jsonMatch[0] : text;
            const parsed = JSON.parse(jsonText);

            return parsed.intents || [];
        } catch (error) {
            console.error('Error generating intent mappings:', error);
            return this.generateFallbackIntents(endpoints);
        }
    }

    /**
     * Build prompt for tag generation
     */
    buildTagGenerationPrompt(endpoints) {
        const endpointsSummary = endpoints.map(ep => ({
            endpointId: ep.endpointId,
            method: ep.method,
            path: ep.path,
            summary: ep.summary,
            description: ep.description,
            tags: ep.tags
        }));

        return `Analyze these API endpoints and generate 2-4 business-oriented tags for each endpoint. Tags should describe:
- What business action/operation the endpoint performs
- What type of data it works with
- Common use cases

Return JSON in format:
{
  "tags": {
    "endpointId1": ["tag1", "tag2", "tag3"],
    "endpointId2": ["tag1", "tag2"]
  }
}

Endpoints:
${JSON.stringify(endpointsSummary, null, 2)}`;
    }

    /**
     * Build prompt for intent mapping
     */
    buildIntentMappingPrompt(endpoints, apiMetadata) {
        const endpointsDetail = endpoints.map(ep => ({
            endpointId: ep.endpointId,
            method: ep.method,
            path: ep.path,
            summary: ep.summary,
            description: ep.description,
            parameters: ep.parameters,
            requestBody: ep.requestBody,
            responses: Object.keys(ep.responses || {})
        }));

        return `Analyze this API and create intent mappings. Group related endpoints into high-level intents with sub-intents.

For each intent, provide:
- name: Clear, user-friendly name
- description: What this intent accomplishes
- category: One of: data_retrieval, data_modification, authentication, search, analytics, configuration
- subIntents: Array of sub-intents, each with:
  - name: Specific action name
  - description: What it does
  - endpointIds: Array of endpoint IDs that fulfill this sub-intent
  - parameterMappings: How user input maps to endpoint parameters
  - requiredFields: Required parameters
  - exampleQueries: 3-5 example user queries

Return JSON in format:
{
  "intents": [
    {
      "intentId": "intent_1",
      "name": "Get User Information",
      "description": "Retrieve user data and profiles",
      "category": "data_retrieval",
      "subIntents": [
        {
          "subIntentId": "sub_1",
          "name": "Get user by ID",
          "description": "Retrieve a specific user's information",
          "endpointIds": ["ep_0_getUser"],
          "parameterMappings": [
            {
              "userInputPattern": "user id or email",
              "parameterName": "userId",
              "constraints": {"type": "string"}
            }
          ],
          "requiredFields": ["userId"],
          "exampleQueries": ["get user 123", "show me user with id 456", "fetch user info for john@example.com"]
        }
      ],
      "commonUseCases": ["View user profile", "Check user status"]
    }
  ]
}

API Metadata:
${JSON.stringify(apiMetadata, null, 2)}

Endpoints:
${JSON.stringify(endpointsDetail, null, 2)}`;
    }

    /**
     * Fallback tag generation when LLM fails
     */
    generateFallbackTags(endpoints) {
        const tags = {};
        endpoints.forEach(ep => {
            const methodTags = {
                'GET': ['read', 'retrieve', 'fetch'],
                'POST': ['create', 'add', 'submit'],
                'PUT': ['update', 'replace', 'modify'],
                'PATCH': ['update', 'modify', 'edit'],
                'DELETE': ['remove', 'delete', 'destroy']
            };

            const baseTags = methodTags[ep.method] || ['action'];
            const pathTags = ep.path.split('/').filter(p => p && !p.startsWith('{')).slice(0, 2);

            tags[ep.endpointId] = [...baseTags, ...pathTags, ...(ep.tags || [])].slice(0, 4);
        });
        return tags;
    }

    /**
     * Fallback intent generation when LLM fails
     */
    generateFallbackIntents(endpoints) {
        const intents = [];
        const grouped = {};

        // Group by method and path pattern
        endpoints.forEach(ep => {
            const category = this.categorizeEndpoint(ep);
            if (!grouped[category]) grouped[category] = [];
            grouped[category].push(ep);
        });

        let intentCounter = 0;
        for (const [category, eps] of Object.entries(grouped)) {
            intents.push({
                intentId: `intent_${intentCounter++}`,
                name: this.categoryToName(category),
                description: `Operations related to ${category}`,
                category,
                subIntents: eps.map((ep, idx) => ({
                    subIntentId: `sub_${intentCounter}_${idx}`,
                    name: ep.summary || `${ep.method} ${ep.path}`,
                    description: ep.description || '',
                    endpointIds: [ep.endpointId],
                    parameterMappings: ep.parameters.map(p => ({
                        userInputPattern: p.name,
                        parameterName: p.name,
                        constraints: p.schema || {}
                    })),
                    requiredFields: ep.parameters.filter(p => p.required).map(p => p.name),
                    exampleQueries: [
                        `${ep.method.toLowerCase()} ${ep.path}`,
                        `call ${ep.operationId}`,
                        `use ${ep.path} endpoint`
                    ]
                })),
                commonUseCases: []
            });
        }

        return intents;
    }

    /**
     * Categorize endpoint by method and path
     */
    categorizeEndpoint(endpoint) {
        if (endpoint.method === 'GET') return 'data_retrieval';
        if (['POST', 'PUT', 'PATCH'].includes(endpoint.method)) return 'data_modification';
        if (endpoint.method === 'DELETE') return 'data_deletion';
        if (endpoint.path.includes('auth') || endpoint.path.includes('login')) return 'authentication';
        return 'general';
    }

    /**
     * Convert category to readable name
     */
    categoryToName(category) {
        const names = {
            'data_retrieval': 'Retrieve Data',
            'data_modification': 'Modify Data',
            'data_deletion': 'Delete Data',
            'authentication': 'Authentication',
            'general': 'General Operations'
        };
        return names[category] || 'Operations';
    }
}

