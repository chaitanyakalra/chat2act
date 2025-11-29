/**
 * API Documentation Parser Service
 * Supports: OpenAPI/Swagger, JSON Schema, YAML, GraphQL
 */

import yaml from 'js-yaml';

export class ApiParserService {
    /**
     * Main entry point - detects format and parses accordingly
     */
    static async parse(rawText, mimeType) {
        try {
            // Detect format
            const format = this.detectFormat(rawText, mimeType);

            let parsed;
            switch (format) {
                case 'openapi':
                case 'swagger':
                    parsed = this.parseOpenAPI(rawText);
                    break;
                case 'graphql':
                    parsed = this.parseGraphQL(rawText);
                    break;
                case 'json':
                    parsed = this.parseJSON(rawText);
                    break;
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }

            // Normalize to our standard structure
            return this.normalize(parsed, format);
        } catch (error) {
            throw new Error(`Parsing failed: ${error.message}`);
        }
    }

    /**
     * Detect API documentation format
     */
    static detectFormat(rawText, mimeType) {
        // Check mime type first
        if (mimeType === 'application/json') {
            try {
                const json = JSON.parse(rawText);
                if (json.openapi || json.swagger) return 'openapi';
                if (json.data && json.data.__schema) return 'graphql';
                return 'json';
            } catch {
                return 'json';
            }
        }

        if (mimeType === 'application/x-yaml' || mimeType === 'text/yaml') {
            try {
                const yamlDoc = yaml.load(rawText);
                if (yamlDoc.openapi || yamlDoc.swagger) return 'openapi';
                return 'yaml';
            } catch {
                return 'yaml';
            }
        }

        // Try to parse as JSON
        try {
            const json = JSON.parse(rawText);
            if (json.openapi || json.swagger) return 'openapi';
            if (json.data && json.data.__schema) return 'graphql';
            return 'json';
        } catch {
            // Try YAML
            try {
                const yamlDoc = yaml.load(rawText);
                if (yamlDoc.openapi || yamlDoc.swagger) return 'openapi';
                return 'yaml';
            } catch {
                throw new Error('Unable to detect format');
            }
        }
    }

    /**
     * Parse OpenAPI/Swagger specification
     */
    static parseOpenAPI(rawText) {
        let spec;
        try {
            spec = JSON.parse(rawText);
        } catch {
            spec = yaml.load(rawText);
        }

        const endpoints = [];
        const baseUrl = spec.servers?.[0]?.url || '';
        const paths = spec.paths || {};

        for (const [path, pathItem] of Object.entries(paths)) {
            for (const [method, operation] of Object.entries(pathItem)) {
                if (!['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method.toLowerCase())) {
                    continue;
                }

                const endpoint = {
                    path,
                    method: method.toUpperCase(),
                    summary: operation.summary || '',
                    description: operation.description || '',
                    operationId: operation.operationId || `${method}_${path.replace(/\//g, '_').replace(/[{}]/g, '')}`,
                    tags: operation.tags || [],
                    parameters: this.extractParameters(operation.parameters || []),
                    requestBody: this.extractRequestBody(operation.requestBody),
                    responses: this.extractResponses(operation.responses || {}),
                    security: operation.security || spec.security || [],
                    deprecated: operation.deprecated || false
                };

                endpoints.push(endpoint);
            }
        }

        return {
            format: 'openapi',
            version: spec.openapi || spec.swagger,
            info: spec.info || {},
            baseUrl,
            endpoints,
            components: spec.components || {},
            securitySchemes: spec.components?.securitySchemes || {}
        };
    }

    /**
     * Parse GraphQL schema
     */
    static parseGraphQL(rawText) {
        let schema;
        try {
            schema = JSON.parse(rawText);
            if (schema.data && schema.data.__schema) {
                schema = schema.data.__schema;
            }
        } catch {
            // Try to parse as GraphQL SDL (would need graphql library)
            throw new Error('GraphQL SDL parsing not yet implemented');
        }

        const endpoints = [];
        const queryType = schema.queryType;
        const mutationType = schema.mutationType;
        const subscriptionType = schema.subscriptionType;

        const processType = (type, method) => {
            if (!type || !type.fields) return;

            for (const field of type.fields) {
                endpoints.push({
                    path: `/${field.name}`,
                    method,
                    summary: field.description || '',
                    description: field.description || '',
                    operationId: field.name,
                    tags: [method === 'POST' ? 'Mutation' : 'Query'],
                    parameters: this.extractGraphQLArgs(field.args || []),
                    requestBody: null,
                    responses: this.extractGraphQLResponse(field.type),
                    security: [],
                    deprecated: field.isDeprecated || false
                });
            }
        };

        if (queryType) {
            const queryFields = schema.types?.find(t => t.name === queryType.name);
            if (queryFields) processType(queryFields, 'GET');
        }

        if (mutationType) {
            const mutationFields = schema.types?.find(t => t.name === mutationType.name);
            if (mutationFields) processType(mutationFields, 'POST');
        }

        return {
            format: 'graphql',
            version: 'graphql',
            info: {},
            baseUrl: '/graphql',
            endpoints,
            components: {},
            securitySchemes: {}
        };
    }

    /**
     * Parse generic JSON API documentation
     */
    static parseJSON(rawText) {
        const json = JSON.parse(rawText);

        // Try to extract endpoints from common structures
        const endpoints = [];

        if (Array.isArray(json)) {
            // Array of endpoints
            json.forEach((item, index) => {
                endpoints.push({
                    path: item.path || item.url || `/endpoint/${index}`,
                    method: item.method || 'GET',
                    summary: item.summary || item.name || '',
                    description: item.description || '',
                    operationId: item.operationId || item.id || `endpoint_${index}`,
                    tags: item.tags || [],
                    parameters: item.parameters || [],
                    requestBody: item.requestBody || item.body || null,
                    responses: item.responses || {},
                    security: item.security || [],
                    deprecated: item.deprecated || false
                });
            });
        } else if (json.endpoints || json.routes) {
            // Object with endpoints/routes property
            const routes = json.endpoints || json.routes;
            if (Array.isArray(routes)) {
                routes.forEach((route, index) => {
                    endpoints.push({
                        path: route.path || route.url || `/endpoint/${index}`,
                        method: route.method || 'GET',
                        summary: route.summary || route.name || '',
                        description: route.description || '',
                        operationId: route.operationId || route.id || `endpoint_${index}`,
                        tags: route.tags || [],
                        parameters: route.parameters || [],
                        requestBody: route.requestBody || route.body || null,
                        responses: route.responses || {},
                        security: route.security || [],
                        deprecated: route.deprecated || false
                    });
                });
            }
        }

        return {
            format: 'json',
            version: json.version || '1.0',
            info: json.info || {},
            baseUrl: json.baseUrl || json.baseURL || '',
            endpoints,
            components: {},
            securitySchemes: json.securitySchemes || {}
        };
    }

    /**
     * Extract parameters from OpenAPI operation
     */
    static extractParameters(params) {
        return params.map(param => {
            const result = {
                name: param.name,
                in: param.in, // query, path, header, cookie
                description: param.description || '',
                required: param.required || false,
                schema: param.schema || param
            };
            if (param.example !== undefined) result.example = param.example;
            if (param.examples !== undefined) result.examples = param.examples;
            return result;
        });
    }

    /**
     * Extract request body from OpenAPI operation
     */
    static extractRequestBody(requestBody) {
        if (!requestBody) return null;

        const content = requestBody.content || {};
        const mediaTypes = Object.keys(content);

        if (mediaTypes.length === 0) return null;

        const primaryContent = content[mediaTypes[0]];

        const result = {
            required: requestBody.required || false,
            description: requestBody.description || '',
            contentTypes: mediaTypes,
            schema: primaryContent.schema || {}
        };

        if (primaryContent.example !== undefined) result.example = primaryContent.example;
        if (primaryContent.examples !== undefined) result.examples = primaryContent.examples;

        return result;
    }

    /**
     * Extract responses from OpenAPI operation
     */
    static extractResponses(responses) {
        const result = {};

        for (const [statusCode, response] of Object.entries(responses)) {
            const content = response.content || {};
            const mediaTypes = Object.keys(content);

            result[statusCode] = {
                description: response.description || '',
                contentTypes: mediaTypes,
                schema: mediaTypes.length > 0 ? (content[mediaTypes[0]].schema || {}) : {},
                example: mediaTypes.length > 0 ? (content[mediaTypes[0]].example || null) : null,
                examples: mediaTypes.length > 0 ? (content[mediaTypes[0]].examples || {}) : {}
            };
        }

        return result;
    }

    /**
     * Extract GraphQL arguments
     */
    static extractGraphQLArgs(args) {
        return args.map(arg => ({
            name: arg.name,
            in: 'query',
            description: arg.description || '',
            required: arg.type.kind === 'NON_NULL',
            schema: {
                type: this.getGraphQLTypeName(arg.type)
            }
        }));
    }

    /**
     * Extract GraphQL response type
     */
    static extractGraphQLResponse(type) {
        return {
            '200': {
                description: 'GraphQL response',
                contentTypes: ['application/json'],
                schema: {
                    type: this.getGraphQLTypeName(type)
                },
                example: null
            }
        };
    }

    /**
     * Get GraphQL type name
     */
    static getGraphQLTypeName(type) {
        if (type.kind === 'NON_NULL') {
            return this.getGraphQLTypeName(type.ofType);
        }
        if (type.kind === 'LIST') {
            return `[${this.getGraphQLTypeName(type.ofType)}]`;
        }
        return type.name || type.kind;
    }

    /**
     * Normalize parsed data to standard structure
     */
    static normalize(parsed, format) {
        return {
            metadata: {
                format,
                version: parsed.version,
                title: parsed.info?.title || 'API Documentation',
                description: parsed.info?.description || '',
                baseUrl: parsed.baseUrl,
                parsedAt: new Date().toISOString()
            },
            endpoints: parsed.endpoints.map((endpoint, index) => ({
                endpointId: `ep_${index}_${endpoint.operationId}`,
                path: endpoint.path,
                method: endpoint.method,
                summary: endpoint.summary,
                description: endpoint.description,
                operationId: endpoint.operationId,
                tags: endpoint.tags,
                parameters: endpoint.parameters,
                requestBody: endpoint.requestBody,
                responses: endpoint.responses,
                security: endpoint.security,
                deprecated: endpoint.deprecated,
                // Additional fields for processing
                businessTags: [], // Will be populated by LLM
                examples: this.extractExamples(endpoint)
            })),
            securitySchemes: parsed.securitySchemes,
            components: parsed.components
        };
    }

    /**
     * Extract examples from endpoint
     */
    static extractExamples(endpoint) {
        const examples = {
            requests: [],
            responses: []
        };

        // Request examples
        if (endpoint.requestBody?.example && endpoint.requestBody.contentTypes?.length > 0) {
            examples.requests.push({
                contentType: endpoint.requestBody.contentTypes[0],
                body: endpoint.requestBody.example
            });
        }

        // Response examples
        for (const [statusCode, response] of Object.entries(endpoint.responses)) {
            if (response.example) {
                examples.responses.push({
                    statusCode: parseInt(statusCode),
                    contentType: response.contentTypes[0],
                    body: response.example
                });
            }
        }

        return examples;
    }
}



