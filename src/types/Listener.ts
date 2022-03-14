import type { BaileysEventEmitter } from '@adiwajshing/baileys'
import type { RedisStorage } from './../'
import { BaileysEvent, Handler, Logger, RedisClient } from './'

abstract class Listener extends Handler {
    protected isRegistered: boolean = false
    protected events: BaileysEvent[]

    constructor(
        protected readonly ev: BaileysEventEmitter,
        protected readonly ignoreEvents: BaileysEvent[],
        storage: RedisStorage,
        redis: RedisClient,
        logger: Logger | null
    ) {
        super(storage, redis, logger)
    }

    /**
     * Toggle event listener on or off
     *
     * @param event Event name
     * @param listener Event listener
     * @param mode Mode (on | off)
     */
    protected toggle(event: BaileysEvent, listener: (arg: any) => void, mode: string = 'on'): void {
        this.ev[mode === 'on' ? mode : 'off'](event, listener)
    }

    /**
     * Map event to listener
     *
     * @param event Event name
     * @param mode Mode
     */
    protected abstract map(event: BaileysEvent, mode: string): void

    /**
     * Toggle event listener on
     *
     * @param event Event name
     */
    public on(event: BaileysEvent): void {
        this.map(event, 'on')
    }

    /**
     * Toggle event listener off
     *
     * @param event Event name
     */
    public off(event: BaileysEvent): void {
        this.map(event, 'off')
    }

    /**
     * Toggle all event listener on
     */
    public async registerAllListeners() {
        if (this.isRegistered) {
            return
        }

        const keyExists = await this.isKeyExists()

        if (!keyExists) {
            await this.clear()
        }

        for (const event of this.events) {
            if (this.ignoreEvents.includes(event)) {
                delete this.events[this.events.indexOf(event)]

                continue
            }

            this.on(event)
        }

        this.isRegistered = true
    }

    /**
     * Toggle all event listener off
     */
    public removeAllListeners(): void {
        for (const event of this.events) {
            this.off(event)
        }

        this.isRegistered = false
    }
}

export default Listener
