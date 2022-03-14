import type { RedisJSON } from '@node-redis/json/dist/commands'
import type { BaileysEventEmitter, Contact } from '@adiwajshing/baileys'
import type { RedisStorage } from './../'
import { BaileysEvent, Listener, Logger, RedisClient } from './../types'
import { isGroup } from './../utils'

class Contacts extends Listener {
    protected keyPrefix: string = 'baileys.contacts'
    protected events: BaileysEvent[] = ['contacts.set', 'contacts.upsert', 'contacts.update']

    private hContactsSet
    private hContactsUpsert
    private hContactsUpdate

    constructor(
        storage: RedisStorage,
        redis: RedisClient,
        ev: BaileysEventEmitter,
        logger: Logger | null,
        ignoreEvents: BaileysEvent[]
    ) {
        super(ev, ignoreEvents, storage, redis, logger)

        this.hContactsSet = this.set.bind(this)
        this.hContactsUpsert = this.upsert.bind(this)
        this.hContactsUpdate = this.update.bind(this)

        this.registerAllListeners()
    }

    protected map(event: BaileysEvent, mode: string): void {
        let handler: (arg: any) => void

        switch (event) {
            case 'contacts.set':
                handler = this.hContactsSet
                break
            case 'contacts.upsert':
                handler = this.hContactsUpsert
                break
            case 'contacts.update':
                handler = this.hContactsUpdate
                break
            default:
                return
        }

        this.toggle(event, handler, mode)
    }

    /**
     * Get contacts
     *
     * @returns Contacts on success or null on error
     */
    public async get() {
        try {
            const result = <unknown>await this.redis.json.get(this.key())

            return <{ [_: string]: Contact }>result
        } catch (err) {
            this.logger?.error({ err }, 'Failed to get contacts')

            return null
        }
    }

    /**
     * Set contacts
     */
    private async set({ contacts: newContacts }: { contacts: Contact[] }) {
        await this.upsert(newContacts)
    }

    /**
     * Upsert contacts
     */
    private async upsert(contacts: Contact[]) {
        const chain = this.redis.multi()
        const oldContacts = (await this.get()) ?? {}

        for (const contact of contacts) {
            if (isGroup(contact.id)) {
                continue
            }

            chain.json.set(
                this.key(),
                `.['${contact.id}']`,
                <RedisJSON>(<unknown>Object.assign(oldContacts[contact.id] ?? {}, contact))
            )
        }

        try {
            await chain.exec()

            this.logger?.debug({ affectedContacts: contacts.length }, 'Synced contacts')
        } catch (err) {
            this.logger?.error({ err }, 'Failed to set contacts')
        }
    }

    /**
     * Update contacts
     */
    private async update(updates: Partial<Contact>[]) {
        const chain = this.redis.multi()
        const oldContacts = (await this.get()) ?? {}

        for (const update of updates) {
            if (!(update.id! in oldContacts)) {
                this.logger?.debug({ update }, 'Got update for non-existent contact')

                continue
            }

            chain.json.set(
                this.key(),
                `.['${update.id!}']`,
                <RedisJSON>(<unknown>Object.assign(oldContacts[update.id!], update))
            )
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to update contacts')
        }
    }
}

export default Contacts
