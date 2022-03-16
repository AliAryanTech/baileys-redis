import type { RedisJSON } from '@node-redis/json/dist/commands'
import {
    BaileysEventEmitter,
    jidNormalizedUser,
    MessageUpdateType,
    MessageUserReceiptUpdate,
    toNumber,
    updateMessageWithReceipt,
    WAMessage,
    WAMessageKey,
} from '@adiwajshing/baileys'
import type { RedisStorage } from './../'
import { BaileysEvent, Listener, Logger, RedisClient } from './../types'

class Messages extends Listener {
    protected keyPrefix: string = 'baileys.messages'
    protected events: BaileysEvent[] = [
        'messages.set',
        'messages.upsert',
        'messages.update',
        'messages.delete',
        'message-receipt.update',
    ]

    private hMessagesSet
    private hMessagesUpsert
    private hMessagesUpdate
    private hMessagesDelete
    private hMessageReceiptUpdate

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
        this.hMessageReceiptUpdate = this.messageReceiptUpdate.bind(this)

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
            case 'message-receipt.update':
                handler = this.hMessageReceiptUpdate
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
     * Get entire messages or all messages by specific id
     *
     * @param id Message jid (Optional)
     * @returns Entire messages or all messages for specific id or null on error
     */
    public async get(id: string = '') {
        const result = await super.get(id)

        return <{ [_: string]: WAMessage[] } | WAMessage[] | null>result
    }

    /**
     * Set messages
     */
    private async set({ messages, isLatest }: { messages: WAMessage[]; isLatest: boolean }) {
        if (isLatest) {
            this.clear()
        }

        const keys = messages.map((m) => {
            return m.key.remoteJid!
        })

        const oldKeys = <string[]>await this.redis.json.objKeys(this.key()) ?? []
        const missingKeys = keys.filter((k) => {
            return !oldKeys.includes(k)
        })

        await this.initArrays(missingKeys)

        const chain = this.redis.multi()

        for (const message of messages) {
            chain.json.arrInsert(this.key(), `.['${message.key.remoteJid}']`, 0, <RedisJSON>(<unknown>message))
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
    private async upsert({ messages, type }: { messages: WAMessage[]; type: MessageUpdateType }) {
        switch (type) {
            case 'append':
            case 'notify':
                let chatIds: string[] = []

                try {
                    chatIds = <string[]>await this.redis.json.objKeys(this.storage.chats()!.key()) ?? []
                } catch (err) {
                    this.logger?.error({ err }, 'Failed to get chat ids')
                }

                const chain = this.redis.multi()

                for (const message of messages) {
                    const jid = jidNormalizedUser(message.key.remoteJid!)

                    chain.json.arrAppend(this.key(), `.['${message.key.remoteJid}']`, <RedisJSON>(<unknown>message))

                    if (type === 'notify' && !chatIds.includes(jid)) {
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
                break
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

        for (const { key: k, update } of updates) {
            const messages = <WAMessage[]>await this.get(k.remoteJid!) ?? []

            if (messages.length <= 0) {
                notExists(update)

                continue
            }

            const message = messages.find((m) => {
                return m.key.id === k.id
            })

            if (!message) {
                notExists(update)

                continue
            }

            chain.json.set(
                this.key(),
                `.['${k.remoteJid}'].[${messages.indexOf(message)}]`,
                <RedisJSON>(<unknown>Object.assign(message, update))
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

        const message = messages.find((m) => {
            return m.key.id === item.keys[0].id
        })

        if (!message) {
            return
        }

        try {
            await this.redis.json.del(this.key(), `.['${jid}'].[${messages.indexOf(message)}]`)
        } catch (err) {
            this.logger?.error({ err }, 'Failed to delete message')
        }
    }

    /**
     * Update message receipt
     */
    private async messageReceiptUpdate(updates: MessageUserReceiptUpdate[]) {
        for (const { key: k, receipt } of updates) {
            const messages = <WAMessage[]>await this.get(k.remoteJid!) ?? []

            if (messages.length <= 0) {
                continue
            }

            const message = messages.find((m) => {
                return m.key.id === k.id
            })

            if (!message) {
                continue
            }

            updateMessageWithReceipt(message, receipt)
        }
    }
}

export default Messages
