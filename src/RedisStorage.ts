import type { BaileysEventEmitter } from '@adiwajshing/baileys'
import type { BaileysEvent, Logger, RedisClient } from './types'
import { Chats, Contacts, GroupsMetadata, Messages, Presence, State } from './handlers'

class RedisStorage {
    private isRegistered: boolean = false

    private iChats: Chats | null = null
    private iContacts: Contacts | null = null
    private iGroupsMetadata: GroupsMetadata | null = null
    private iMessages: Messages | null = null
    private iPresence: Presence | null = null
    private iState: State | null = null

    constructor(
        public readonly sessionId: string,
        private readonly redis: RedisClient,
        private readonly ev: BaileysEventEmitter,
        private readonly logger: Logger | null = null
    ) {}

    /**
     * Construct handlers and start listening to the events
     *
     * @param ignoreEvents An array of events that won't be listened to
     */
    public register(ignoreEvents: BaileysEvent[] = []): void {
        if (this.isRegistered) {
            return
        }

        this.iChats = new Chats(this, this.redis, this.ev, this.logger, ignoreEvents)
        this.iContacts = new Contacts(this, this.redis, this.ev, this.logger, ignoreEvents)
        this.iGroupsMetadata = new GroupsMetadata(this, this.redis, this.ev, this.logger, ignoreEvents)
        this.iMessages = new Messages(this, this.redis, this.ev, this.logger, ignoreEvents)
        this.iPresence = new Presence(this, this.redis, this.ev, this.logger, ignoreEvents)
        this.iState = new State(this, this.redis, this.ev, this.logger, ignoreEvents)

        this.isRegistered = true
    }

    /**
     * Remove all event listeners
     */
    private removeAllListeners() {
        this.iChats!.removeAllListeners()
        this.iContacts!.removeAllListeners()
        this.iGroupsMetadata!.removeAllListeners()
        this.iMessages!.removeAllListeners()
        this.iPresence!.removeAllListeners()
        this.iState!.removeAllListeners()
    }

    /**
     * Dispose handler instances
     */
    private dispose() {
        this.iChats = null
        this.iContacts = null
        this.iGroupsMetadata = null
        this.iMessages = null
        this.iPresence = null
        this.iState = null
    }

    /**
     * Remove all event listeners and dispose the handler instances
     */
    public destroy(): void {
        if (!this.isRegistered) {
            return
        }

        this.removeAllListeners()
        this.dispose()

        this.isRegistered = false
    }

    /**
     * Get chats handler instance
     *
     * @returns Chats handler instance if registered or else return null
     */
    public chats() {
        return this.iChats
    }

    /**
     * Get contacts handler instance
     *
     * @returns Contacts handler instance if registered or else return null
     */
    public contacts() {
        return this.iContacts
    }

    /**
     * Get groups metadata handler instance
     *
     * @returns Groups metadata handler instance if registered or else return null
     */
    public groupsMetadata() {
        return this.iGroupsMetadata
    }

    /**
     * Get messages handler instance
     *
     * @returns Messages handler instance if registered or else return null
     */
    public messages() {
        return this.iMessages
    }

    /**
     * Get presence handler instance
     *
     * @returns Presence handler instance if registered or else return null
     */
    public presence() {
        return this.iPresence
    }

    /**
     * Get state handler instance
     *
     * @returns State handler instance if registered or else return null
     */
    public state() {
        return this.iState
    }
}

export default RedisStorage
