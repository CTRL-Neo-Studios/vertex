import {exists, mkdir, readTextFile, writeTextFile} from "@tauri-apps/plugin-fs";
import type {ActiveSession} from "#shared/types/active/sessions";
import {readTypes, withType, writeTypes} from "#shared/utils/index/propertyTypes";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";

export interface PropertyTypes {
    /** Type per property name, in Obsidian's names (`types.json`). */
    types: Readonly<ShallowRef<Record<string, string>>>
    /** Sets a key's type (`null`: Automatic) and saves it. */
    set(key: string, type: string | null): Promise<void>
}

const stores = new Map<string, PropertyTypes>()

/**
 * A workspace's property types, like Obsidian's vault-wide `types.json`: read from `.vertex/types.json`, or from
 * `.obsidian/types.json` until Vertex has its own (so a vault starts with Obsidian's types), and always written to
 * `.vertex/types.json`, never to `.obsidian/`. Read again when either file changes on disk. One store per workspace
 * window (a workspace opens in one window only, so this window is the file's only writer). `null` without a workspace.
 */
export function usePropertyTypes(session: ActiveSession | undefined): PropertyTypes | null {
    const root = session?.workspaceSession ? session.rootPath : undefined
    if (!session || !root) return null
    const existing = stores.get(session.uuid)
    if (existing) return existing

    const own = `${root}/.vertex/types.json`, obsidian = `${root}/.obsidian/types.json`
    const types = shallowRef<Record<string, string>>({})
    const read = async (path: string) => ((await exists(path)) ? readTypes(await readTextFile(path)) : null)
    async function load() {
        try {
            types.value = (await read(own)) ?? (await read(obsidian)) ?? {}
        } catch (error) {
            console.error('[usePropertyTypes] load', error)
        }
    }
    void load()
    // ponytail: never unsubscribed; it lives as long as the window's session does.
    useActiveWorkspaceIndex(session).on((event) => {
        if (event.type === 'changed' && event.paths.some(path => path === own || path === obsidian)) void load()
    })

    const store: PropertyTypes = {
        types,
        async set(key, type) {
            const next = withType(types.value, key, type)
            types.value = next
            await mkdir(`${root}/.vertex`, {recursive: true})
            await writeTextFile(own, writeTypes(next))
        },
    }
    stores.set(session.uuid, store)
    return store
}
