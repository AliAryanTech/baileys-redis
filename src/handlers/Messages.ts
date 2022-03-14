import type { RedisJSON } from '@node-redis/json/dist/commands'
import {
    BaileysEventEmitter,
    jidNormalizedUser,
    MessageUpdateType,
    toNumber,
    WAMessage,
    WAMessageKey,
} from '@adiwajshing/baileys'
import type { RedisStorage } from './../'
import { BaileysEvent, Listener, Logger, RedisClient } from './../types'

class Messages extends Listener {
    protected keyPrefix: string = 'baileys.messages'
    protected events: BaileysEvent[] = ['messages.set', 'messages.upsert', 'messages.update', 'messages.delete']

    private hMessagesSet
    private hMessagesUpsert
    private hMessagesUpdate
    private hMessagesDelete

    constructor(
        storage: RedisStorage,
        redis: RedisClient,
        ev: BaileysEventEmitter,
        logger: Logger | null,
        ignoreEvents: BaileysEvent[]
    ) {
        super(ev, ignoreEvents, storage, redis, logger)

        this.hMessagesSet = this.set.bind(this)
        this.hMessagesUpsert = this.upsert.bind(this)
        this.hMessagesUpdate = this.update.bind(this)
        this.hMessagesDelete = this.del.bind(this)

        this.registerAllListeners()
    }

    protected map(event: BaileysEvent, mode: string): void {
        let handler: (arg: any) => void

        switch (event) {
            case 'messages.set':
                handler = this.hMessagesSet
                break
            case 'messages.upsert':
                handler = this.hMessagesUpsert
                break
            case 'messages.update':
                handler = this.hMessagesUpdate
                break
            case 'messages.delete':
                handler = this.hMessagesDelete
                break
            default:
                return
        }

        this.toggle(event, handler, mode)
    }

    /**
     * Initialize empty array as container
     */
    private async initArrays(keys: string[]) {
        const chain = this.redis.multi()

        for (const k of keys) {
            chain.json.set(this.key(), `.['${k}']`, [])
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to initialize messages')
        }
    }

    /**
     * Get entire messages or all messages by specific jid
     *
     * @param jid Message jid (Optional)
     * @returns Entire messages or all messages for specific jid or null on error
     */
    public async get(jid: string = '') {
        try {
            const result = <unknown>await this.redis.json.get(this.key(), jid ? { path: [`.['${jid}']`] } : undefined)

            return <WAMessage[] | { [_: string]: WAMessage[] }>result
        } catch (err) {
            this.logger?.error({ err }, 'Failed to get contacts')

            return null
        }
    }

    /**
     * Set messages
     */
    private async set({ messages: newMessages, isLatest }: { messages: WAMessage[]; isLatest: boolean }) {
        if (isLatest) {
            this.clear()
        }

        const keys = newMessages.map((message) => {
            return message.key.remoteJid!
        })

        const oldKeys = <string[]>await this.redis.json.objKeys(this.key()) ?? []
        const missingKeys = keys.filter((key) => {
            return !oldKeys.includes(key)
        })

        await this.initArrays(missingKeys)

        const chain = this.redis.multi()

        for (const message of newMessages) {
            chain.json.arrInsert(this.key(), `.['${message.key.remoteJid!}']`, 0, <RedisJSON>(<unknown>message))
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to set messages')
        }
    }

    /**
     * Upsert messages
     */
    private async upsert({ messages: newMessages, type }: { messages: WAMessage[]; type: MessageUpdateType }) {
        if (type !== 'notify') {
            return
        }

        let chatIds: string[] = []

        try {
            chatIds = <string[]>await this.redis.json.objKeys(this.storage.chats()!.key()) ?? []
        } catch (err) {
            this.logger?.error({ err }, 'Failed to get chat ids')
        }

        const chain = this.redis.multi()

        for (const message of newMessages) {
            const jid = jidNormalizedUser(message.key.remoteJid!)

            chain.json.arrAppend(this.key(), `.['${message.key.remoteJid!}']`, <RedisJSON>(<unknown>message))

            if (!chatIds.includes(jid)) {
                this.ev.emit('chats.upsert', [
                    {
                        id: jid,
                        conversationTimestamp: toNumber(message.messageTimestamp!),
                        unreadCount: 1,
                    },
                ])
            }
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to upsert messages')
        }
    }

    /**
     * Update messages
     */
    private async update(updates: (WAMessage & { update: WAMessage })[]) {
        const notExists = (update: WAMessage) => {
            this.logger?.debug({ update }, 'Got update for non-existent message')
        }

        const chain = this.redis.multi()

        for (const { update, key: k } of updates) {
            const messages = <WAMessage[]>await this.get(k.remoteJid!) ?? []

            if (messages.length <= 0) {
                notExists(update)

                continue
            }

            const message = messages.filter((m) => {
                return m.key.id === k.id
            })

            if (message.length <= 0) {
                notExists(update)

                continue
            }

            chain.json.set(
                this.key(),
                `.[${messages.indexOf(message[0])}]`,
                <RedisJSON>(<unknown>Object.assign(message[0], update))
            )
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to update messages')
        }
    }

    /**
     * Delete messages
     */
    private async del(item: { keys: WAMessageKey[] } | { jid: string; all: true }) {
        if ('all' in item) {
            try {
                await this.redis.json.del(this.key(), `.['${item.jid}']`)
            } catch (err) {
                this.logger?.error({ err }, 'Failed to delete messages')
            }

            return
        }

        const jid = item.keys[0].remoteJid!
        const messages = <WAMessage[]>await this.get(jid) ?? []

        if (messages.length <= 0) {
            return
        }

        const message = messages.filter((m) => {
            return m.key.id === item.keys[0].id
        })

        if (message.length <= 0) {
            return
        }

        try {
            await this.redis.json.del(this.key(), `.['${jid}'].[${messages.indexOf(message[0])}]`)
        } catch (err) {
            this.logger?.error({ err }, 'Failed to delete message')
        }
    }
}

export default Messages
