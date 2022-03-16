import type { RedisJSON } from '@node-redis/json/dist/commands'
import type { BaileysEventEmitter, ConnectionState } from '@adiwajshing/baileys'
import type { RedisStorage } from './../'
import { BaileysEvent, Listener, Logger, RedisClient } from './../types'

class State extends Listener {
    protected keyPrefix: string = 'baileys.state'
    protected events: BaileysEvent[] = ['connection.update']

    private hConnectionUpdate

    constructor(
        storage: RedisStorage,
        redis: RedisClient,
        ev: BaileysEventEmitter,
        logger: Logger | null,
        ignoreEvents: BaileysEvent[]
    ) {
        super(ev, ignoreEvents, storage, redis, logger)

        this.hConnectionUpdate = this.update.bind(this)
        this.registerAllListeners()
    }

    protected map(event: BaileysEvent, mode: string): void {
        if (event === 'connection.update') {
            this.toggle(event, this.hConnectionUpdate, mode)
        }
    }

    /**
     * Get current connection state
     *
     * @returns Connection state on success or null on error
     */
    public async get() {
        const result = await super.get()

        return <Partial<ConnectionState> | null>result
    }

    /**
     * Update connection state
     */
    private async update(data: Partial<ConnectionState>) {
        const chain = this.redis.multi()

        for (const [k, v] of Object.entries(data)) {
            chain.json.set(this.key(), `.['${k}']`, <RedisJSON>v)
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to update connection state')
        }
    }
}

export default State
