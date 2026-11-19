/**
 * A plugin's `plugin.json`: what Vertex knows about a plugin without running it. Validated when a core plugin is built
 * (`modules/core-plugins.ts`) and, later, when a community plugin is installed.
 */

import permissionTable from './permissions.json'

/** The plugin API this build of Vertex implements. A manifest asking for a newer one is refused. */
export const API_VERSION = 1

export const WINDOW_KINDS = ['main', 'session', 'settings'] as const
export type WindowKind = typeof WINDOW_KINDS[number]

/**
 * What a plugin may use beyond the window's own grant. Rust grants a window what each name stands for
 * (`permissions.json`, the kernel's `grants.rs`) while a plugin asking for it is on there.
 */
export type PluginPermission = 'network' | 'secrets' | 'files-outside-workspace' | 'notifications'
export const PLUGIN_PERMISSIONS = Object.keys(permissionTable) as PluginPermission[]
// Spelled out above so the SDK's types don't import JSON; this fails to compile when `permissions.json` names others.
const permissionsMatch: [PluginPermission, keyof typeof permissionTable] extends [keyof typeof permissionTable, PluginPermission] ? true : false = true
void permissionsMatch

/** Who may override a plugin's setting from a workspace's `.vertex/settings.json`. */
export const OVERRIDE_LEVELS = ['workspace', 'trustedWorkspace'] as const
export type OverrideLevel = typeof OVERRIDE_LEVELS[number]

interface FieldBase {
    /** Path inside the plugin's config (`depth`, `colors.tags`). */
    key: string
    /** i18n key, under `plugins.<id>`. */
    label: string
    /** i18n key: one line under the label. */
    description?: string
    /** i18n key: more than a line of explanation, behind the row's info button. */
    info?: string
}

/** A setting the Settings window draws without running the plugin. Its `default` is the plugin's default too. */
export type ConfigField =
    | FieldBase & { type: 'switch', default: boolean }
    | FieldBase & { type: 'text' | 'color', default: string, placeholder?: string }
    | FieldBase & { type: 'number', default: number, min?: number, max?: number, step?: number }
    | FieldBase & { type: 'select', default: string, options: { value: string, label: string }[] }
    | FieldBase & { type: 'list', default: string[], placeholder?: string }
    /** A path inside the workspace (no leading slash); its picker is offered while a workspace's settings are edited. */
    | FieldBase & { type: 'path', default: string, kind: 'file' | 'folder' }

export interface PluginConfigManifest {
    /** Path inside the config → who may override it from a workspace. Unlisted paths are global only. */
    overridable?: Record<string, OverrideLevel>
    schema?: ConfigField[]
}

export interface PluginManifest {
    /** Lowercase letters, digits and inner hyphens: it also names the plugin's strings, state and Rust crate. */
    id: string
    name: string
    version: string
    description?: string
    /** Iconify name (`i-lucide-waypoints`), for its rows and its settings page. */
    icon?: string
    /**
     * The plugin's Git repository (`https://github.com/me/my-plugin`): where its updates come from. Shown as what the
     * plugin says of itself; Vertex records where it actually fetched a plugin from.
     */
    repository?: string
    author?: string
    apiVersion: number
    /** The oldest Vertex it runs in (`0.9.2`); an older app keeps it off. */
    minAppVersion?: string
    /** The windows it runs in; default `['session']`. */
    windows?: WindowKind[]
    /** Plugin ids it needs; a trailing `?` marks one it uses when it's there. */
    requires?: string[]
    permissions?: PluginPermission[]
    /** Whether it's on until the user turns it off; default `true`. */
    enabledByDefault?: boolean
    config?: PluginConfigManifest
    /** Windows of its own it may open from a session window (`ctx.windows`), each by `id`; it runs alone in them. */
    ownWindows?: OwnWindowManifest[]
}

/** One of a plugin's own windows: its id (lowercase letters, digits, inner hyphens) and size, in logical pixels. */
export interface OwnWindowManifest {
    id: string
    width: number
    height: number
    minWidth?: number
    minHeight?: number
    /** Default `true`. */
    resizable?: boolean
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

const KEYS = new Set(['id', 'name', 'version', 'description', 'icon', 'author', 'repository', 'apiVersion', 'minAppVersion', 'windows', 'requires', 'permissions', 'enabledByDefault', 'config', 'ownWindows'])
const isString = (v: unknown): v is string => typeof v === 'string'
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString)
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export const CONFIG_PATH = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/

const FIELD_KEYS: Record<ConfigField['type'], string[]> = {
    switch: [],
    text: ['placeholder'],
    color: ['placeholder'],
    number: ['min', 'max', 'step'],
    select: ['options'],
    list: ['placeholder'],
    path: ['kind'],
}

function validateField(f: unknown, at: string, errors: string[]) {
    if (!isObject(f)) return void errors.push(`${at} must be an object`)
    const type = f.type as ConfigField['type']
    if (!(type in FIELD_KEYS)) return void errors.push(`${at}.type must be one of ${Object.keys(FIELD_KEYS).join(', ')}`)
    for (const key of Object.keys(f)) {
        if (!['key', 'type', 'label', 'description', 'info', 'default', ...FIELD_KEYS[type]].includes(key)) errors.push(`${at} has an unknown key "${key}"`)
    }
    if (!isString(f.key) || !CONFIG_PATH.test(f.key)) errors.push(`${at}.key must be a dotted path of letters, digits, "_" and "-"`)
    if (!isString(f.label) || !f.label) errors.push(`${at}.label must be an i18n key`)
    for (const key of ['description', 'info'] as const) if (f[key] !== undefined && !isString(f[key])) errors.push(`${at}.${key} must be an i18n key`)
    if (f.placeholder !== undefined && !isString(f.placeholder)) errors.push(`${at}.placeholder must be a string`)
    const d = f.default
    if (type === 'switch' && typeof d !== 'boolean') errors.push(`${at}.default must be true or false`)
    if ((type === 'text' || type === 'color' || type === 'path') && !isString(d)) errors.push(`${at}.default must be a string`)
    if (type === 'list' && !isStringList(d)) errors.push(`${at}.default must be a list of strings`)
    if (type === 'path' && f.kind !== 'file' && f.kind !== 'folder') errors.push(`${at}.kind must be "file" or "folder"`)
    if (type === 'number') {
        for (const key of ['min', 'max', 'step'] as const) if (f[key] !== undefined && !isNumber(f[key])) errors.push(`${at}.${key} must be a number`)
        if (!isNumber(d)) errors.push(`${at}.default must be a number`)
        else if ((isNumber(f.min) && d < f.min) || (isNumber(f.max) && d > f.max)) errors.push(`${at}.default must be within min and max`)
    }
    if (type === 'select') {
        const options = f.options
        if (!Array.isArray(options) || !options.length || !options.every(o => isObject(o) && isString(o.value) && isString(o.label))) {
            errors.push(`${at}.options must be a non-empty list of {value, label}`)
        } else if (!options.some(o => o.value === d)) errors.push(`${at}.default must be one of its options`)
    }
}

function validateConfig(config: unknown, errors: string[]) {
    if (!isObject(config)) return void errors.push('"config" must be an object')
    for (const key of Object.keys(config)) if (key !== 'overridable' && key !== 'schema') errors.push(`unknown key "config.${key}"`)
    if (config.overridable !== undefined) {
        if (!isObject(config.overridable)) errors.push('"config.overridable" must map paths to "workspace" or "trustedWorkspace"')
        else for (const [path, level] of Object.entries(config.overridable)) {
            if (!CONFIG_PATH.test(path)) errors.push(`"config.overridable" has an invalid path "${path}"`)
            if (!(OVERRIDE_LEVELS as readonly unknown[]).includes(level)) errors.push(`"config.overridable.${path}" must be "workspace" or "trustedWorkspace"`)
        }
    }
    if (config.schema !== undefined) {
        if (!Array.isArray(config.schema)) return void errors.push('"config.schema" must be a list of fields')
        const keys = new Set<unknown>()
        config.schema.forEach((field: unknown, i) => {
            validateField(field, `"config.schema[${i}]"`, errors)
            const key = isObject(field) ? field.key : undefined
            if (keys.has(key)) errors.push(`"config.schema[${i}].key" "${String(key)}" is used twice`)
            keys.add(key)
        })
    }
}

/** Pre-release identifiers compared as semver does: numbers as numbers and before words, a shorter list first. */
function laterPrerelease(a: string, b: string): boolean {
    const [x, y] = [a.split('.'), b.split('.')]
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const [p, q] = [x[i], y[i]]
        if (p === q) continue
        if (p === undefined || q === undefined) return q === undefined
        const [m, n] = [/^\d+$/.test(p), /^\d+$/.test(q)]
        if (m && n) return Number(p) > Number(q)
        return m === n ? p > q : !m
    }
    return false
}

/**
 * `a` (a `minAppVersion`) is a later version than `b` (the app's), by their numbers (`0.10` > `0.9.2`). With the same
 * numbers, a minimum that names a pre-release is later than an earlier pre-release (`1.0.0-beta.2` > `1.0.0-beta.1`);
 * one that doesn't is met by that version's pre-releases too, so a beta runs what its release will.
 */
function laterVersion(a: string, b: string): boolean {
    const split = (v: string) => {
        const [, numbers = '0', pre] = /^(\d+(?:\.\d+)*)(?:-(.+))?/.exec(v) ?? []
        return {numbers: numbers.split('.').map(Number), pre}
    }
    const [x, y] = [split(a), split(b)]
    for (let i = 0; i < Math.max(x.numbers.length, y.numbers.length); i++) {
        if ((x.numbers[i] ?? 0) !== (y.numbers[i] ?? 0)) return (x.numbers[i] ?? 0) > (y.numbers[i] ?? 0)
    }
    return !!x.pre && !!y.pre && laterPrerelease(x.pre, y.pre)
}

/**
 * Checks a parsed `plugin.json`; every problem is listed, not only the first. With `appVersion` (the running app's),
 * a `minAppVersion` above it is one.
 */
export function validateManifest(raw: unknown, appVersion?: string): ManifestResult {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {ok: false, errors: ['the manifest must be a JSON object']}
    const m = raw as Record<string, unknown>
    const errors: string[] = []
    for (const key of Object.keys(m)) if (!KEYS.has(key)) errors.push(`unknown key "${key}"`)

    if (!isString(m.id) || !PLUGIN_ID.test(m.id) || m.id.length > MAX_ID) {
        errors.push(`"id" must be lowercase letters, digits and inner hyphens, at most ${MAX_ID} characters`)
    }
    if (!isString(m.name) || !m.name.trim()) errors.push('"name" must be a non-empty string')
    if (!isString(m.version) || !m.version.trim()) errors.push('"version" must be a non-empty string')
    for (const key of ['description', 'icon', 'author'] as const) {
        if (m[key] !== undefined && !isString(m[key])) errors.push(`"${key}" must be a string`)
    }
    if (m.minAppVersion !== undefined) {
        if (!isString(m.minAppVersion) || !/^\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/.test(m.minAppVersion)) errors.push('"minAppVersion" must be a version like 0.9.2 or 1.0.0-beta.2')
        else if (appVersion && laterVersion(m.minAppVersion, appVersion)) errors.push(`"minAppVersion" ${m.minAppVersion} is newer than this Vertex (${appVersion})`)
    }
    if (m.repository !== undefined && !(isString(m.repository) && /^https:\/\/[^\s/]+\/\S+$/.test(m.repository))) {
        errors.push('"repository" must be an https URL of a Git repository')
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
    if (m.config !== undefined) validateConfig(m.config, errors)
    if (m.ownWindows !== undefined) validateOwnWindows(m.ownWindows, errors)

    return errors.length ? {ok: false, errors} : {ok: true, manifest: m as unknown as PluginManifest}
}

const SIZE = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 100 && v <= 4000

function validateOwnWindows(raw: unknown, errors: string[]) {
    if (!Array.isArray(raw)) return void errors.push('"ownWindows" must be a list of windows')
    const seen = new Set<string>()
    raw.forEach((w: Record<string, unknown> | null, i) => {
        const at = `"ownWindows"[${i}]`
        if (!w || typeof w !== 'object') return void errors.push(`${at} must be an object`)
        const unknown = Object.keys(w).filter(k => !['id', 'width', 'height', 'minWidth', 'minHeight', 'resizable'].includes(k))
        if (unknown.length) errors.push(`${at} has unknown keys: ${unknown.join(', ')}`)
        if (!isString(w.id) || !PLUGIN_ID.test(w.id)) errors.push(`${at}.id must be lowercase letters, digits and inner hyphens`)
        else if (seen.has(w.id)) errors.push(`${at}.id "${w.id}" is declared twice`)
        else seen.add(w.id)
        for (const key of ['width', 'height'] as const) if (!SIZE(w[key])) errors.push(`${at}.${key} must be a number from 100 to 4000`)
        for (const key of ['minWidth', 'minHeight'] as const) if (w[key] !== undefined && !SIZE(w[key])) errors.push(`${at}.${key} must be a number from 100 to 4000`)
        if (w.resizable !== undefined && typeof w.resizable !== 'boolean') errors.push(`${at}.resizable must be true or false`)
    })
}

/**
 * The id rule for a plugin folder (installed, or in a workspace's `.vertex/plugins/`): its `plugin.json` (`raw`, or
 * `readError` when it couldn't be read) validates against `appVersion`, names the folder's own name as its `id`, and
 * that isn't a core plugin's. A workspace's copy may share an installed plugin's id; it replaces that one there.
 */
export function checkPluginFolder(folder: string, raw: unknown, readError: string | null, appVersion: string, coreIds: ReadonlySet<string>): ManifestResult {
    const result = readError ? {ok: false as const, errors: [readError]} : validateManifest(raw, appVersion)
    if (!result.ok) return result
    if (result.manifest.id !== folder) return {ok: false, errors: [`"id" is "${result.manifest.id}" but its folder is "${folder}"`]}
    if (coreIds.has(folder)) return {ok: false, errors: [`"${folder}" is a core plugin's id`]}
    return result
}
