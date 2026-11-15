/**
 * A plugin's `plugin.json`: what Vertex knows about a plugin without running it. Validated when a core plugin is built
 * (`modules/core-plugins.ts`) and, later, when a community plugin is installed.
 */

/** The plugin API this build of Vertex implements. A manifest asking for a newer one is refused. */
export const API_VERSION = 1

export const WINDOW_KINDS = ['main', 'session', 'settings'] as const
export type WindowKind = typeof WINDOW_KINDS[number]

/** What a plugin says it uses, shown before it's installed or trusted. Disclosure, not a sandbox. */
export const PLUGIN_PERMISSIONS = ['network', 'secrets', 'files-outside-workspace'] as const
export type PluginPermission = typeof PLUGIN_PERMISSIONS[number]

export interface PluginManifest {
    /** Lowercase letters, digits and inner hyphens: it also names the plugin's strings, state and Rust crate. */
    id: string
    name: string
    version: string
    description?: string
    author?: string
    apiVersion: number
    minAppVersion?: string
    /** The windows it runs in; default `['session']`. */
    windows?: WindowKind[]
    /** Plugin ids it needs; a trailing `?` marks one it uses when it's there. */
    requires?: string[]
    permissions?: PluginPermission[]
    /** Whether it's on until the user turns it off; default `true`. */
    enabledByDefault?: boolean
}

export const PLUGIN_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
/** `vertex-<id>` must stay within Tauri's 64-character plugin names. */
const MAX_ID = 50

export interface Requirement {
    id: string
    optional: boolean
}

export const parseRequirement = (entry: string): Requirement =>
    entry.endsWith('?') ? {id: entry.slice(0, -1), optional: true} : {id: entry, optional: false}

export const pluginWindows = (manifest: PluginManifest): WindowKind[] => manifest.windows ?? ['session']

export type ManifestResult = { ok: true, manifest: PluginManifest } | { ok: false, errors: string[] }

const KEYS = new Set(['id', 'name', 'version', 'description', 'author', 'apiVersion', 'minAppVersion', 'windows', 'requires', 'permissions', 'enabledByDefault'])
const isString = (v: unknown): v is string => typeof v === 'string'
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString)

/** Checks a parsed `plugin.json`; every problem is listed, not only the first. */
export function validateManifest(raw: unknown): ManifestResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {ok: false, errors: ['the manifest must be a JSON object']}
    const m = raw as Record<string, unknown>
    const errors: string[] = []
    for (const key of Object.keys(m)) if (!KEYS.has(key)) errors.push(`unknown key "${key}"`)

    if (!isString(m.id) || !PLUGIN_ID.test(m.id) || m.id.length > MAX_ID) {
        errors.push(`"id" must be lowercase letters, digits and inner hyphens, at most ${MAX_ID} characters`)
    }
    if (!isString(m.name) || !m.name.trim()) errors.push('"name" must be a non-empty string')
    if (!isString(m.version) || !m.version.trim()) errors.push('"version" must be a non-empty string')
    for (const key of ['description', 'author', 'minAppVersion'] as const) {
        if (m[key] !== undefined && !isString(m[key])) errors.push(`"${key}" must be a string`)
    }
    if (typeof m.apiVersion !== 'number' || !Number.isInteger(m.apiVersion) || m.apiVersion < 1) {
        errors.push('"apiVersion" must be a positive integer')
    } else if (m.apiVersion > API_VERSION) {
        errors.push(`"apiVersion" ${m.apiVersion} is newer than this Vertex supports (${API_VERSION})`)
    }
    if (m.windows !== undefined) {
        if (!isStringList(m.windows) || !m.windows.length || m.windows.some(w => !(WINDOW_KINDS as readonly string[]).includes(w))) {
            errors.push(`"windows" must be a non-empty list of ${WINDOW_KINDS.join(', ')}`)
        }
    }
    if (m.requires !== undefined) {
        if (!isStringList(m.requires)) errors.push('"requires" must be a list of plugin ids')
        else for (const entry of m.requires) {
            const {id} = parseRequirement(entry)
            if (!PLUGIN_ID.test(id)) errors.push(`"requires" has an invalid plugin id "${entry}"`)
            else if (id === m.id) errors.push('"requires" lists the plugin itself')
        }
    }
    if (m.permissions !== undefined) {
        if (!isStringList(m.permissions) || m.permissions.some(p => !(PLUGIN_PERMISSIONS as readonly string[]).includes(p))) {
            errors.push(`"permissions" must be a list of ${PLUGIN_PERMISSIONS.join(', ')}`)
        }
    }
    if (m.enabledByDefault !== undefined && typeof m.enabledByDefault !== 'boolean') errors.push('"enabledByDefault" must be true or false')

    return errors.length ? {ok: false, errors} : {ok: true, manifest: m as unknown as PluginManifest}
}
