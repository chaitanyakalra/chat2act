# OAuth Integration Guide for Third-Party SaaS Companies

## Overview

This guide explains how third-party SaaS companies can send OAuth tokens to the chat2act platform to enable API integrations.

## Endpoint

**URL**: `https://your-domain.com/api/organization/oauth/callback`  
**Method**: `POST`  
**Content-Type**: `application/json`

## When to Send Tokens

Send tokens to this endpoint in the following scenarios:

1. **Initial Authorization** - When a user first authorizes your application
2. **Token Refresh** - When you refresh an access token
3. **Token Update** - When token permissions/scopes change

## Request Payload

```json
{
  "event": "token_created",
  "token": {
    "access_token": "ya29.a0AfH6SMBx...",
    "refresh_token": "1//0gZ9X8...",
    "expires_in": 3600,
    "token_type": "Bearer",
    "scope": "read write admin"
  },
  "user": {
    "org_id": "60058906537",
    "org_name": "Acme Corporation",
    "email": "admin@acme.com"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | string | No | Event type: `token_created`, `token_refreshed`, `token_updated` |
| `token.access_token` | string | **Yes** | OAuth access token |
| `token.refresh_token` | string | No | OAuth refresh token (recommended) |
| `token.expires_in` | number | No | Token lifetime in seconds (default: 3600) |
| `token.token_type` | string | No | Token type (default: "Bearer") |
| `token.scope` | string | No | Space-separated list of scopes |
| `user.org_id` | string | **Yes** | Unique organization identifier |
| `user.org_name` | string | No | Organization display name |
| `user.email` | string | No | Contact email for the organization |
| `timestamp` | string | No | ISO 8601 timestamp of token creation |

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "message": "OAuth token received and stored successfully",
  "org_id": "60058906537",
  "expires_at": "2024-01-15T11:30:00Z"
}
```

### Error Responses

#### 400 Bad Request - Missing Required Fields

```json
{
  "success": false,
  "error": "Missing required field: token.access_token"
}
```

#### 500 Internal Server Error

```json
{
  "success": false,
  "error": "Internal server error",
  "message": "Error details here"
}
```

## How chat2act Uses Your Token

Once received, chat2act will:

1. **Store the token** securely in the `Organization` model
2. **Use the token** in API requests to your endpoints by including it in the `Authorization` header:
   ```
   Authorization: Bearer ya29.a0AfH6SMBx...
   ```
3. **Refresh the token** automatically when it expires (if `refresh_token` is provided)

## Implementation Examples

### Node.js / Express

```javascript
const axios = require('axios');

async function sendTokenToChat2Act(tokenData, orgData) {
  try {
    const response = await axios.post('https://your-chat2act-domain.com/api/organization/oauth/callback', {
      event: 'token_created',
      token: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: 'Bearer',
        scope: tokenData.scope
      },
      user: {
        org_id: orgData.id,
        org_name: orgData.name,
        email: orgData.email
      },
      timestamp: new Date().toISOString()
    });

    console.log('Token sent successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Failed to send token:', error.response?.data || error.message);
    throw error;
  }
}
```

### Python / Flask

```python
import requests
from datetime import datetime

def send_token_to_chat2act(token_data, org_data):
    url = 'https://your-chat2act-domain.com/api/organization/oauth/callback'
    
    payload = {
        'event': 'token_created',
        'token': {
            'access_token': token_data['access_token'],
            'refresh_token': token_data.get('refresh_token'),
            'expires_in': token_data.get('expires_in', 3600),
            'token_type': 'Bearer',
            'scope': token_data.get('scope')
        },
        'user': {
            'org_id': org_data['id'],
            'org_name': org_data['name'],
            'email': org_data['email']
        },
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }
    
    response = requests.post(url, json=payload)
    response.raise_for_status()
    
    print('Token sent successfully:', response.json())
    return response.json()
```

### cURL

```bash
curl -X POST https://your-chat2act-domain.com/api/organization/oauth/callback \
  -H "Content-Type: application/json" \
  -d '{
    "event": "token_created",
    "token": {
      "access_token": "ya29.a0AfH6SMBx...",
      "refresh_token": "1//0gZ9X8...",
      "expires_in": 3600,
      "token_type": "Bearer",
      "scope": "read write"
    },
    "user": {
      "org_id": "60058906537",
      "org_name": "Acme Corporation",
      "email": "admin@acme.com"
    },
    "timestamp": "2024-01-15T10:30:00Z"
  }'
```

## Testing

### Health Check

Before sending tokens, verify the endpoint is available:

```bash
curl https://your-chat2act-domain.com/api/organization/oauth/health
```

Expected response:
```json
{
  "success": true,
  "message": "OAuth callback endpoint is ready",
  "endpoint": "/api/organization/oauth/callback"
}
```

## Security Considerations

1. **HTTPS Only** - Always use HTTPS in production
2. **Validate Responses** - Check the response status and handle errors appropriately
3. **Token Security** - Never log or expose tokens in plain text
4. **Retry Logic** - Implement retry logic with exponential backoff for failed requests
5. **Webhook Verification** - Consider implementing webhook signature verification (future enhancement)

## Support

For questions or issues, contact: [your-support-email]

## Changelog

- **v1.0.0** (2024-01-15) - Initial release
