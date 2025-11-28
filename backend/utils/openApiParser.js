import yaml from 'js-yaml';
import axios from 'axios';

/**
 * Parse OpenAPI/Swagger specification from URL or file content
 * @param {string} source - URL or file content
 * @param {string} sourceType - 'url' or 'file'
 * @returns {Promise<object>} - Parsed specification object
 */
export const parseOpenApiSpec = async (source, sourceType = 'url') => {
  let rawContent = '';
  
  try {
    if (sourceType === 'url') {
      console.log(`📤 Fetching OpenAPI spec from: ${source}`);
      const response = await axios.get(source, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json, application/yaml, text/yaml'
        }
      });
      rawContent = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } else {
      rawContent = source;
    }
    
    // Try to parse as JSON first
    let spec;
    try {
      spec = typeof rawContent === 'string' ? JSON.parse(rawContent) : rawContent;
    } catch (jsonError) {
      // If JSON parsing fails, try YAML
      try {
        spec = yaml.load(rawContent);
      } catch (yamlError) {
        throw new Error('Failed to parse as JSON or YAML');
      }
    }
    
    console.log(`✅ Successfully parsed OpenAPI spec (version: ${spec.openapi || spec.swagger || 'unknown'})`);
    return spec;
  } catch (error) {
    console.error('❌ Error parsing OpenAPI spec:', error.message);
    throw error;
  }
};

/**
 * Extract endpoints from OpenAPI 3.0 or Swagger 2.0 specification
 * @param {object} spec - Parsed OpenAPI/Swagger specification
 * @returns {Array} - Array of endpoint objects
 */
export const extractEndpoints = (spec) => {
  const endpoints = [];
  
  if (!spec.paths) {
    console.warn('⚠️  No paths found in specification');
    return endpoints;
  }
  
  // Iterate through all paths
  Object.entries(spec.paths).forEach(([path, pathItem]) => {
    // Iterate through all HTTP methods for this path
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    
    methods.forEach(method => {
      if (pathItem[method]) {
        const operation = pathItem[method];
        
        // Extract parameters
        const parameters = {};
        
        // Path parameters
        if (operation.parameters) {
          operation.parameters.forEach(param => {
            parameters[param.name] = {
              type: param.type || param.schema?.type || 'string',
              in: param.in,
              required: param.required || false,
              description: param.description || ''
            };
          });
        }
        
        // Request body (OpenAPI 3.0)
        if (operation.requestBody) {
          parameters._body = {
            type: 'object',
            in: 'body',
            required: operation.requestBody.required || false,
            description: operation.requestBody.description || '',
            schema: operation.requestBody.content?.['application/json']?.schema || {}
          };
        }
        
        // Create endpoint object
        endpoints.push({
          method: method.toUpperCase(),
          endpoint: path,
          description: operation.summary || operation.description || `${method.toUpperCase()} ${path}`,
          parameters: parameters,
          operationId: operation.operationId || null,
          tags: operation.tags || []
        });
      }
    });
  });
  
  console.log(`✅ Extracted ${endpoints.length} endpoints from specification`);
  return endpoints;
};

/**
 * Create a searchable text representation of an endpoint
 * @param {object} endpoint - Endpoint object
 * @returns {string} - Text representation for embedding
 */
export const endpointToText = (endpoint) => {
  const parts = [
    `${endpoint.method} ${endpoint.endpoint}`,
    endpoint.description
  ];
  
  // Add parameter information
  if (endpoint.parameters && Object.keys(endpoint.parameters).length > 0) {
    const paramNames = Object.keys(endpoint.parameters).join(', ');
    parts.push(`Parameters: ${paramNames}`);
  }
  
  // Add tags
  if (endpoint.tags && endpoint.tags.length > 0) {
    parts.push(`Tags: ${endpoint.tags.join(', ')}`);
  }
  
  return parts.join('. ');
};

/**
 * Validate OpenAPI specification
 * @param {object} spec - Parsed specification
 * @returns {object} - { valid: boolean, version: string, errors: Array }
 */
export const validateSpec = (spec) => {
  const errors = [];
  
  // Check for version
  let version = null;
  if (spec.openapi) {
    version = 'OpenAPI ' + spec.openapi;
  } else if (spec.swagger) {
    version = 'Swagger ' + spec.swagger;
  } else {
    errors.push('No OpenAPI or Swagger version found');
  }
  
  // Check for required fields
  if (!spec.info) {
    errors.push('Missing required field: info');
  }
  
  if (!spec.paths) {
    errors.push('Missing required field: paths');
  }
  
  const valid = errors.length === 0;
  
  if (valid) {
    console.log(`✅ Specification is valid (${version})`);
  } else {
    console.warn(`⚠️  Specification validation errors:`, errors);
  }
  
  return { valid, version, errors };
};

/**
 * Complete parsing pipeline
 * @param {string} source - URL or file content
 * @param {string} sourceType - 'url' or 'file'
 * @returns {Promise<object>} - { spec, endpoints, validation }
 */
export const parseAndExtract = async (source, sourceType = 'url') => {
  console.log(`🔄 Starting OpenAPI parsing pipeline...`);
  
  // Parse specification
  const spec = await parseOpenApiSpec(source, sourceType);
  
  // Validate
  const validation = validateSpec(spec);
  
  if (!validation.valid) {
    throw new Error(`Invalid OpenAPI specification: ${validation.errors.join(', ')}`);
  }
  
  // Extract endpoints
  const endpoints = extractEndpoints(spec);
  
  console.log(`✅ Parsing pipeline complete. Found ${endpoints.length} endpoints.`);
  
  return {
    spec,
    endpoints,
    validation
  };
};
