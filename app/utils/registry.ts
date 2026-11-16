import {shallowReactive} from 'vue'

/**
 * A reactive list of contributions by id (panel views, tab kinds, viewers…): what reads it re-renders when something is
 * added or removed. A second definition with an id already in it is an error; a removal only removes its own.
 */
export function createRegistry<T>(what: string, idOf: (def: T) => string) {
    const items = shallowReactive(new Map<string, T>())
    return {
        items: items as ReadonlyMap<string, T>,
        get: (id: string | undefined) => (id === undefined ? undefined : items.get(id)),
        register(def: T): () => void {
            const id = idOf(def)
            if (items.has(id)) throw new Error(`${what} "${id}" is already registered`)
            items.set(id, def)
            return () => {
                if (items.get(id) === def) items.delete(id)
            }
        },
    }
}

export type Registry<T> = ReturnType<typeof createRegistry<T>>

/** A reactive list of contributions without ids (editor extensions, Markdown syntax), in registration order. */
export function createList<T>() {
    const items = shallowReactive(new Set<T>())
    return {
        items: items as ReadonlySet<T>,
        register(def: T): () => void {
            items.add(def)
            return () => void items.delete(def)
        },
    }
}
