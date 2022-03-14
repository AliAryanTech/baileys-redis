import type { RedisJSON } from '@node-redis/json/dist/commands'
import type { BaileysEventEmitter, Chat } from '@adiwajshing/baileys'
import type { RedisStorage } from './../'
import { BaileysEvent, Listener, Logger, RedisClient } from './../types'

class Chats extends Listener {
    protected keyPrefix: string = 'baileys.chats'
    protected events: BaileysEvent[] = ['chats.set', 'chats.upsert', 'chats.update', 'chats.delete']

    private hChatsSet
    private hChatsUpsert
    private hChatsUpdate
    private hChatsDelete

    constructor(
        storage: RedisStorage,
        redis: RedisClient,
        ev: BaileysEventEmitter,
        logger: Logger | null,
        ignoreEvents: BaileysEvent[]
    ) {
        super(ev, ignoreEvents, storage, redis, logger)

        this.hChatsSet = this.set.bind(this)
        this.hChatsUpsert = this.upsert.bind(this)
        this.hChatsUpdate = this.update.bind(this)
        this.hChatsDelete = this.del.bind(this)

        this.registerAllListeners()
    }

    protected map(event: BaileysEvent, mode: string): void {
        let handler: (arg: any) => void

        switch (event) {
            case 'chats.set':
                handler = this.hChatsSet
                break
            case 'chats.upsert':
                handler = this.hChatsUpsert
                break
            case 'chats.update':
                handler = this.hChatsUpdate
                break
            case 'chats.delete':
                handler = this.hChatsDelete
                break
            default:
                return
        }

        this.toggle(event, handler, mode)
    }

    /**
     * Get chats
     *
     * @returns Chats on success or null on error
     */
    public async get() {
        try {
            const result = await this.redis.json.get(this.key())

            return <{ [_: string]: Chat }>result
        } catch (err) {
            this.logger?.error({ err }, 'Failed to get chats')

            return null
        }
    }

    /**
     * Set chats
     */
    private async set({ chats: newChats, isLatest }: { chats: Chat[]; isLatest: boolean }) {
        if (isLatest) {
            await this.clear()
        }

        const chain = this.redis.multi()
        const oldChats = (await this.get()) ?? {}

        for (const chat of newChats) {
            chain.json.set(this.key(), `.['${chat.id}']`, <RedisJSON>Object.assign(oldChats[chat.id] ?? {}, chat))
        }

        try {
            await chain.exec()

            this.logger?.debug({ affectedChats: newChats.length }, 'Synced chats')
        } catch (err) {
            this.logger?.error({ err }, 'Failed to set chats')
        }
    }

    /**
     * Upsert chats
     */
    private async upsert(newChats: Chat[]) {
        const chain = this.redis.multi()

        for (const chat of newChats) {
            chain.json.set(this.key(), `.['${chat.id}']`, <RedisJSON>chat)
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to upsert chats')
        }
    }

    /**
     * Update chats
     */
    private async update(updates: Partial<Chat>[]) {
        const chain = this.redis.multi()
        const oldChats = (await this.get()) ?? {}

        for (const update of updates) {
            if (!(update.id! in oldChats)) {
                this.logger?.debug({ update }, 'Got update for non-existent chat')

                continue
            }

            if (update.unreadCount && update.unreadCount > 0) {
                update.unreadCount += oldChats[update.id!].unreadCount ?? 0
            }

            chain.json.set(this.key(), `.['${update.id!}']`, <RedisJSON>Object.assign(oldChats[update.id!], update))
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to update chats')
        }
    }

    /**
     * Delete chats
     */
    private async del(ids: string[]) {
        const chain = this.redis.multi()

        for (const id of ids) {
            chain.json.del(this.key(), `.['${id}']`)
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to delete chats')
        }
    }
}

export default Chats
