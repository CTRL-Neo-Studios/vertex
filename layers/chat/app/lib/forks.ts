/** What branching needs of a message. */
type Message = { id: string }
type Forks = Record<string, (Message[] | null)[]>

/** The fork key for the point at `messages[at]`: the message before it, `''` at the start. */
const keyAt = (messages: Message[], at: number) => messages[at - 1]?.id ?? ''

/**
 * Keeps `messages` from `at` on as a branch of `forks` (mutated) and returns the messages before `at`, which the
 * caller continues as the new branch.
 */
export function fork<M extends Message>(forks: Record<string, (M[] | null)[]>, messages: M[], at: number): M[] {
    const key = keyAt(messages, at)
    const tails = forks[key] ?? [null]
    tails[tails.indexOf(null)] = messages.slice(at)
    tails.push(null)
    forks[key] = tails
    return messages.slice(0, at)
}

/** The branch shown at `messages[at]` (0-based) and how many there are; undefined where nothing forks. */
export function branchAt(forks: Forks | undefined, messages: Message[], at: number) {
    const tails = at >= 0 ? forks?.[keyAt(messages, at)] : undefined
    return tails && at < messages.length ? {index: tails.indexOf(null), count: tails.length} : undefined
}

/** Shows branch `to` at `messages[at]` instead of the current one (kept in `forks`); returns the new messages. */
export function switchBranch<M extends Message>(forks: Record<string, (M[] | null)[]>, messages: M[], at: number, to: number): M[] {
    const tails = forks[keyAt(messages, at)]
    const next = tails?.[to]
    if (!tails || !next) return messages
    tails[tails.indexOf(null)] = messages.slice(at)
    tails[to] = null
    return [...messages.slice(0, at), ...next]
}

/**
 * The forks `messages` can still reach, e.g. after a rewind cut the messages some hung off. A fork hangs off a message
 * with something after it: its key is never a list's last message.
 */
export function pruneForks<F extends Forks>(forks: F, messages: Message[]): F {
    // The start's fork needs a first message to hang at; any other hangs off a message with something after it.
    const points = new Set<string>(messages.length ? [''] : [])
    const reach = (list: Message[]) => {
        for (const m of list.slice(0, -1)) points.add(m.id)
    }
    reach(messages)
    const kept = new Set<string>()
    for (let grew = true; grew;) {
        grew = false
        for (const key of Object.keys(forks)) {
            if (kept.has(key) || !points.has(key)) continue
            kept.add(key)
            grew = true
            for (const tail of forks[key]!) if (tail) reach(tail)
        }
    }
    return Object.fromEntries(Object.entries(forks).filter(([key]) => kept.has(key))) as F
}
