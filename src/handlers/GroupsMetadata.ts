import type { RedisJSON } from '@node-redis/json/dist/commands'
import type { BaileysEventEmitter, GroupMetadata, ParticipantAction } from '@adiwajshing/baileys'
import type { RedisStorage } from './../'
import { BaileysEvent, Listener, Logger, RedisClient } from './../types'

class GroupsMetadata extends Listener {
    protected keyPrefix: string = 'baileys.groups-metadata'
    protected events: BaileysEvent[] = ['groups.update', 'group-participants.update']

    private hGroupsUpdate
    private hGroupParticipantsUpdate

    constructor(
        storage: RedisStorage,
        redis: RedisClient,
        ev: BaileysEventEmitter,
        logger: Logger | null,
        ignoreEvents: BaileysEvent[]
    ) {
        super(ev, ignoreEvents, storage, redis, logger)

        this.hGroupsUpdate = this.update.bind(this)
        this.hGroupParticipantsUpdate = this.groupParticipantsUpdate.bind(this)

        this.registerAllListeners()
    }

    protected map(event: BaileysEvent, mode: string): void {
        if (event === 'groups.update') {
            this.toggle(event, this.hGroupsUpdate, mode)
        } else if (event === 'group-participants.update') {
            this.toggle(event, this.hGroupParticipantsUpdate, mode)
        }
    }

    /**
     * Get all Groups metadata or group metadata by specific id
     *
     * @param id Group jid (Optional)
     * @returns Group(s) metadata on success or null on error
     */
    public async get(id: string = '') {
        const result = await super.get(id)

        return <GroupMetadata | { [_: string]: GroupMetadata }>result
    }

    /**
     * Update groups metadata
     */
    private async update(updates: Partial<GroupMetadata>[]) {
        const chain = this.redis.multi()
        const oldGroups = <{ [_: string]: GroupMetadata }>await this.get() ?? {}

        for (const update of updates) {
            if (!(update.id! in oldGroups)) {
                this.logger?.debug({ update }, 'Got update for non-existent group metadata')

                continue
            }

            chain.json.set(
                this.key(),
                `.['${update.id}']`,
                <RedisJSON>(<unknown>Object.assign(oldGroups[update.id!], update))
            )
        }

        try {
            await chain.exec()
        } catch (err) {
            this.logger?.error({ err }, 'Failed to update groups metadata')
        }
    }

    /**
     * Update group metadata on group participants update
     */
    private async groupParticipantsUpdate({
        id,
        participants,
        action,
    }: {
        id: string
        participants: string[]
        action: ParticipantAction
    }) {
        const metadata = <GroupMetadata>await this.get(id)

        if (!metadata) {
            return
        }

        switch (action) {
            case 'add':
                metadata.participants.push(
                    ...participants.map((id) => {
                        return { id, isAdmin: false, isSuperAdmin: false }
                    })
                )
                break
            case 'demote':
            case 'promote':
                for (const participant of metadata.participants) {
                    if (participants.includes(participant.id)) {
                        participant.isAdmin = action === 'promote'
                    }
                }
                break
            case 'remove':
                metadata.participants = metadata.participants.filter((p) => {
                    return !participants.includes(p.id)
                })
                break
        }

        try {
            this.redis.json.set(this.key(), `['${id}']`, <RedisJSON>(<unknown>metadata))
        } catch (err) {
            this.logger?.error({ err }, 'Failed to update group metadata')
        }
    }
}

export default GroupsMetadata
