/**
 * Redis Session Service
 * Manages visitor session parameters from Zoho SalesIQ
 * Caches visitor.params (orgId, userId, accessToken, role, etc.) for reuse across chat messages
 */

import Redis from 'ioredis';

class RedisSessionService {
    constructor() {
        this.redis = null;
        this.isConnected = false;
        this.defaultTTL = 86400; // 24 hours in seconds
        this.init();
    }

    /**
     * Initialize Redis connection
     */
    init() {
        try {
            const redisConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD || undefined,
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    return delay;
                },
                maxRetriesPerRequest: 3
            };

            this.redis = new Redis(redisConfig);

            this.redis.on('connect', () => {
                console.log('✅ Redis connected');
                this.isConnected = true;
            });

            this.redis.on('error', (err) => {
                console.error('❌ Redis connection error:', err.message);
                this.isConnected = false;
            });

            this.redis.on('close', () => {
                console.log('⚠️  Redis connection closed');
                this.isConnected = false;
            });

        } catch (error) {
            console.error('❌ Failed to initialize Redis:', error);
            this.isConnected = false;
        }
    }

    /**
     * Generate Redis key for visitor session
     * @param {String} visitorId - Zoho visitor ID
     * @param {String} orgId - Zoho Organization ID (optional but recommended)
     * @returns {String} Redis key
     */
    _getKey(visitorId, orgId = null) {
        if (orgId) {
            return `session:${orgId}:${visitorId}`;
        }
        return `session:${visitorId}`;
    }

    /**
     * Store visitor session parameters in Redis
     * @param {String} visitorId - Zoho visitor ID
     * @param {Object} params - Visitor parameters
     * @param {String} chatId - Optional chat ID
     * @param {Number} ttl - Optional TTL in seconds (default: 24 hours)
     * @param {String} orgId - Optional Org ID for namespacing
     * @returns {Promise<Boolean>} Success status
     */
    async storeSession(visitorId, params, chatId = null, ttl = null, orgId = null) {
        if (!this.isConnected) {
            console.warn('⚠️  Redis not connected, skipping session storage');
            return false;
        }

        try {
            const sessionData = {
                ...params,
                chatId,
                timestamp: Date.now(),
                lastUpdated: new Date().toISOString()
            };

            const key = this._getKey(visitorId, orgId);
            const value = JSON.stringify(sessionData);
            const expiryTime = ttl || this.defaultTTL;

            await this.redis.setex(key, expiryTime, value);

            console.log(`✅ Stored session for visitor: ${visitorId} (Org: ${orgId || 'N/A'})`);
            console.log(`   Key: ${key}`);

            return true;

        } catch (error) {
            console.error(`❌ Failed to store session for ${visitorId}:`, error);
            return false;
        }
    }

    /**
     * Retrieve visitor session parameters from Redis
     * @param {String} visitorId - Zoho visitor ID
     * @param {String} orgId - Optional Org ID for namespacing
     * @returns {Promise<Object|null>} Session data or null if not found
     */
    async getSession(visitorId, orgId = null) {
        if (!this.isConnected) {
            console.warn('⚠️  Redis not connected, returning null');
            return null;
        }

        try {
            const key = this._getKey(visitorId, orgId);
            const value = await this.redis.get(key);

            if (!value) {
                // Fallback: Try without orgId if not found (backward compatibility)
                if (orgId) {
                    const fallbackKey = this._getKey(visitorId, null);
                    const fallbackValue = await this.redis.get(fallbackKey);
                    if (fallbackValue) {
                        console.log(`⚠️  Found session with legacy key format: ${fallbackKey}`);
                        return JSON.parse(fallbackValue);
                    }
                }

                console.log(`ℹ️  No cached session found for key: ${key}`);
                return null;
            }

            const sessionData = JSON.parse(value);
            console.log(`✅ Retrieved session for visitor: ${visitorId}`);

            return sessionData;

        } catch (error) {
            console.error(`❌ Failed to retrieve session for ${visitorId}:`, error);
            return null;
        }
    }

    /**
     * Update existing session with new data (preserves existing values)
     * @param {String} visitorId - Zoho visitor ID
     * @param {Object} updates - New/updated parameters
     * @returns {Promise<Boolean>} Success status
     */
    async updateSession(visitorId, updates) {
        if (!this.isConnected) {
            console.warn('⚠️  Redis not connected, skipping session update');
            return false;
        }

        try {
            // Note: We need orgId to update correctly. 
            // If orgId is inside updates, we can use it. Otherwise, this might fail for namespaced keys.
            // For now, we'll try to get session with just visitorId (legacy) or assume orgId is in updates.
            const orgId = updates.orgId;
            const existingSession = await this.getSession(visitorId, orgId);

            if (!existingSession) {
                console.log(`ℹ️  No existing session to update for ${visitorId}, creating new one`);
                return await this.storeSession(visitorId, updates, null, null, orgId);
            }

            // Merge existing with updates (updates take precedence)
            const mergedData = {
                ...existingSession,
                ...updates,
                lastUpdated: new Date().toISOString()
            };

            const key = this._getKey(visitorId, orgId || existingSession.orgId);
            const value = JSON.stringify(mergedData);

            // Preserve original TTL
            const ttl = await this.redis.ttl(key);
            const expiryTime = ttl > 0 ? ttl : this.defaultTTL;

            await this.redis.setex(key, expiryTime, value);

            console.log(`✅ Updated session for visitor: ${visitorId}`);
            console.log(`   Updates: ${JSON.stringify(updates)}`);

            return true;

        } catch (error) {
            console.error(`❌ Failed to update session for ${visitorId}:`, error);
            return false;
        }
    }

    /**
     * Delete visitor session from Redis
     * @param {String} visitorId - Zoho visitor ID
     * @returns {Promise<Boolean>} Success status
     */
    async deleteSession(visitorId) {
        if (!this.isConnected) {
            console.warn('⚠️  Redis not connected, skipping session deletion');
            return false;
        }

        try {
            // Note: This only deletes legacy key or requires orgId knowledge.
            // Ideally we should pass orgId to deleteSession too.
            const key = this._getKey(visitorId);
            await this.redis.del(key);

            console.log(`✅ Deleted session for visitor: ${visitorId}`);
            return true;

        } catch (error) {
            console.error(`❌ Failed to delete session for ${visitorId}:`, error);
            return false;
        }
    }

    /**
     * Check if session exists for visitor
     * @param {String} visitorId - Zoho visitor ID
     * @returns {Promise<Boolean>} Existence status
     */
    async sessionExists(visitorId) {
        if (!this.isConnected) {
            return false;
        }

        try {
            const key = this._getKey(visitorId);
            const exists = await this.redis.exists(key);
            return exists === 1;

        } catch (error) {
            console.error(`❌ Failed to check session existence for ${visitorId}:`, error);
            return false;
        }
    }

    /**
     * Get remaining TTL for a session
     * @param {String} visitorId - Zoho visitor ID
     * @returns {Promise<Number>} TTL in seconds (-1 if no expiry, -2 if key doesn't exist)
     */
    async getSessionTTL(visitorId) {
        if (!this.isConnected) {
            return -2;
        }

        try {
            const key = this._getKey(visitorId);
            return await this.redis.ttl(key);

        } catch (error) {
            console.error(`❌ Failed to get TTL for ${visitorId}:`, error);
            return -2;
        }
    }

    /**
     * Close Redis connection (cleanup)
     */
    async close() {
        if (this.redis) {
            await this.redis.quit();
            console.log('✅ Redis connection closed');
        }
    }
}

export default new RedisSessionService();
