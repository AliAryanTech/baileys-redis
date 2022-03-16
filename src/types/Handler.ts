import type { RedisStorage } from './../'
import type { RedisClient, Logger } from './../types'

abstract class Handler {
    protected readonly keyPrefix: string

    constructor(
        protected readonly storage: RedisStorage,
        protected readonly redis: RedisClient,
        protected readonly logger: Logger | null
    ) {}

    /**
     * Generate prefixed key name
     *
     * @returns Generated key
     */
    public key(): string {
        return `${this.keyPrefix}.${this.storage.sessionId}`
    }

    /**
     * Check if key exists in redis
     *
     * @returns true on success and key exists or false on error or data didn't exists
     */
    protected async isKeyExists() {
        try {
            const result = await this.redis.exists(this.key())

            return result > 0
        } catch (err) {
            return false
        }
    }

    /**
     * Get entire data or all data by specific id
     *
     * @param id Data id (Optional)
     * @returns Entire data or all data by specific id or null on error
     */
    public async get(id: string = '') {
        try {
            const result = await this.redis.json.get(this.key(), id ? { path: [`.['${id}']`] } : undefined)

            return <unknown>result
        } catch (err) {
            this.logger?.error({ err }, `Failed to get "${this.key()}" data`)

            return null
        }
    }

    /**
     * Clear redis json data and replace with empty object
     */
    public async clear() {
        try {
            await this.redis.json.set(this.key(), '.', {})
        } catch (err) {
            this.logger?.error({ err }, `Failed to clear "${this.key()}" data`)
        }
    }

    /**
     * Delete redis key
     */
    public async delete() {
        try {
            await this.redis.json.del(this.key())
        } catch (err) {
            this.logger?.error({ err }, `Failed to delete "${this.key()}" data`)
        }
    }
}

export default Handler
