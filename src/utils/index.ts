/**
 * Determine if given jid is a group
 *
 * @param jid Jid
 * @returns boolean
 */
const isGroup = (jid: string) => {
    return jid.endsWith('@g.us')
}

export { isGroup }
