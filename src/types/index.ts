import type { createClient } from 'redis'
import type pino from 'pino'
import type { BaileysEventMap } from '@adiwajshing/baileys'

export type RedisClient = ReturnType<typeof createClient>
export type Logger = ReturnType<typeof pino>

export type BaileysEvent = keyof BaileysEventMap<any>

export { default as Handler } from './Handler'
export { default as Listener } from './Listener'
