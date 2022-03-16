import type { RedisJSON } from '@node-redis/json/dist/commands'
import type { BaileysEventEmitter, PresenceData } from '@adiwajshing/baileys'
import type { RedisStorage } from './../'
import { BaileysEvent, Listener, Logger, RedisClient } from './../types'

class Presence extends Listener {
    protected keyPrefix: string = 'baileys.presence'
    protected events: BaileysEvent[] = ['presence.update']

    private hPresenceUpdate

    constructor(
        storage: RedisStorage,
        redis: RedisClient,
        ev: BaileysEventEmitter,
        logger: Logger | null,
        ignoreEvents: BaileysEvent[]
    ) {
        super(ev, ignoreEvents, storage, redis, logger)

        this.hPresenceUpdate = this.update.bind(this)
        this.registerAllListeners()
    }

    protected map(event: BaileysEvent, mode: string): void {
        if (event === 'presence.update') {
            this.toggle(event, this.hPresenceUpdate, mode)
        }
    }

    /**
     * Get all presences details or presence details by specific id
     *
     * @param id Presence jid (Optional)
     * @returns Presence(s) details on success or null on error
     */
    public async get(id: string = '') {
        const result = await super.get(id)

        return <
            { [participant: string]: PresenceData } | { [id: string]: { [participant: string]: PresenceData } } | null
        >result
    }

    /**
     * Update presence
     */
    private async update({ id, presences }: { id: string; presences: { [participant: string]: PresenceData } }) {
        const presence = <{ [participant: string]: PresenceData }>await this.get(id) ?? {}

        try {
            this.redis.json.set(this.key(), `['${id}']`, <RedisJSON>(<unknown>Object.assign(presence, presences)))
        } catch (err) {
            this.logger?.error({ err }, 'Failed to update presence data')
        }
    }
}

export default Presence
