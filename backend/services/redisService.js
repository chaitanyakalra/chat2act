/**
 * Redis Service
 * Manages knownIds cache for parameter resolution
 * Works alongside redisSessionService for different caching needs
 */

import Redis from 'ioredis';

class RedisService {
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
                console.log('✅ Redis (knownIds) connected');
                this.isConnected = true;
            });

            this.redis.on('error', (err) => {
                console.error('❌ Redis (knownIds) connection error:', err.message);
                this.isConnected = false;
            });

            this.redis.on('close', () => {
                console.log('⚠️  Redis (knownIds) connection closed');
                this.isConnected = false;
            });

        } catch (error) {
            console.error('❌ Failed to initialize Redis (knownIds):', error);
            this.isConnected = false;
        }
    }

    /**
     * Get knownIds from Redis
     * @param {String} conversationKey - Format: "orgId:visitorId"
     * @returns {Promise<Object|null>} knownIds object or null
     */
    async getKnownIds(conversationKey) {
        if (!this.isConnected) {
            return null;
        }

        try {
            const key = `knownIds:${conversationKey}`;
            const value = await this.redis.get(key);

            if (!value) {
                return null;
            }

            return JSON.parse(value);
        } catch (error) {
            console.error(`❌ Failed to get knownIds for ${conversationKey}:`, error);
            return null;
        }
    }

    /**
     * Set knownIds in Redis (replaces entire object)
     * @param {String} conversationKey - Format: "orgId:visitorId"
     * @param {Object} knownIdsObj - Object with key-value pairs
     * @returns {Promise<Boolean>} Success status
     */
    async setKnownIds(conversationKey, knownIdsObj) {
        if (!this.isConnected) {
            return false;
        }

        try {
            const key = `knownIds:${conversationKey}`;
            const value = JSON.stringify(knownIdsObj);
            await this.redis.setex(key, this.defaultTTL, value);
            return true;
        } catch (error) {
            console.error(`❌ Failed to set knownIds for ${conversationKey}:`, error);
            return false;
        }
    }

    /**
     * Update a single knownId field in Redis (merges with existing)
     * @param {String} conversationKey - Format: "orgId:visitorId"
     * @param {String} idKey - The key to update (e.g., "userId", "email")
     * @param {String} idValue - The value to set
     * @returns {Promise<Boolean>} Success status
     */
    async updateKnownId(conversationKey, idKey, idValue) {
        if (!this.isConnected) {
            return false;
        }

        try {
            // Get existing knownIds
            const existing = await this.getKnownIds(conversationKey) || {};

            // Update the specific field
            existing[idKey] = idValue;

            // Save back
            return await this.setKnownIds(conversationKey, existing);
        } catch (error) {
            console.error(`❌ Failed to update knownId ${idKey} for ${conversationKey}:`, error);
            return false;
        }
    }

    /**
     * Delete knownIds from Redis
     * @param {String} conversationKey - Format: "orgId:visitorId"
     * @returns {Promise<Boolean>} Success status
     */
    async deleteKnownIds(conversationKey) {
        if (!this.isConnected) {
            return false;
        }

        try {
            const key = `knownIds:${conversationKey}`;
            await this.redis.del(key);
            return true;
        } catch (error) {
            console.error(`❌ Failed to delete knownIds for ${conversationKey}:`, error);
            return false;
        }
    }

    /**
     * Close Redis connection (cleanup)
     */
    async close() {
        if (this.redis) {
            await this.redis.quit();
            console.log('✅ Redis (knownIds) connection closed');
        }
    }
}

export default new RedisService();
