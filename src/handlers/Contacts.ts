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
     * Get all contacts details or contact details by specific id
     *
     * @param id Contact jid (Optional)
     * @returns Contact(s) details on success or null on error
     */
    public async get(id: string = '') {
        const result = await super.get(id)

        return <{ [_: string]: Contact } | Contact | null>result
    }

    /**
     * Set contacts
     */
    private async set({ contacts }: { contacts: Contact[] }) {
        await this.upsert(contacts)
    }

    /**
     * Upsert contacts
     */
    private async upsert(contacts: Contact[]) {
        const chain = this.redis.multi()

        const oldContacts = <{ [_: string]: Contact }>await this.get() ?? {}
        const deletedContacts = new Set(Object.keys(oldContacts))

        for (const contact of contacts) {
            deletedContacts.delete(contact.id)

            if (isGroup(contact.id)) {
                continue
            }

            chain.json.set(
                this.key(),
                `.['${contact.id}']`,
                <RedisJSON>(<unknown>Object.assign(oldContacts[contact.id] ?? {}, contact))
            )
        }

        for (const id of deletedContacts) {
            chain.json.del(this.key(), `.['${id}']`)
        }

        try {
            await chain.exec()

            this.logger?.debug(
                { deletedContacts: deletedContacts.size, affectedContacts: contacts.length },
                'Synced contacts'
            )
        } catch (err) {
            this.logger?.error({ err }, 'Failed to set contacts')
        }
    }

    /**
     * Update contacts
     */
    private async update(updates: Partial<Contact>[]) {
        const chain = this.redis.multi()
        const oldContacts = <{ [_: string]: Contact }>await this.get() ?? {}

        for (const update of updates) {
            if (!(update.id! in oldContacts)) {
                this.logger?.debug({ update }, 'Got update for non-existent contact')

                continue
            }

            chain.json.set(
                this.key(),
                `.['${update.id}']`,
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
