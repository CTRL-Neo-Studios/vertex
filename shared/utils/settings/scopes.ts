import type {AppSettings} from "#shared/types/app/settings";
import type {DeepPartial} from "#shared/types/types";
import {defaultAppSettings} from "#shared/utils/defaults/apps";

/**
 * Global and workspace settings (VS Code's User and Workspace). There's one `AppSettings` type: a workspace's
 * `.vertex/settings.json` is a `DeepPartial<AppSettings>` holding only what it changes, and the list below says
 * which settings it may change. Everything else (trust, updates, sessions, language, workflow limits) stays global.
 */

/** Every dotted path into `T`, objects included: `themeConfig`, `themeConfig.primaryColor`. */
export type SettingPath<T> = {
    [K in keyof T & string]: T[K] extends readonly unknown[] ? K : T[K] extends object ? K | `${K}.${SettingPath<T[K]>}` : K
}[keyof T & string]

export type SettingAt<T, P extends string> = P extends `${infer K}.${infer Rest}`
    ? K extends keyof T ? SettingAt<T[K], Rest> : never
    : P extends keyof T ? T[P] : never

export type AppSettingPath = SettingPath<AppSettings>

/**
 * What a workspace may override; an entry covers everything under it. `trustedWorkspace` only applies when the
 * workspace's folder is trusted (Settings → Workflows): custom CSS can restyle or hide anything, the trust prompt
 * included, and load remote URLs. Making another setting overridable is one line here.
 */
export const WORKSPACE_OVERRIDABLE = {
    themeConfig: 'workspace',
    viewConfig: 'workspace',
    'advancedThemeConfig.customCss': 'trustedWorkspace',
    // A workspace picking which model its notes go to could send them to a provider the user didn't choose for it.
    'aiConfig.features': 'trustedWorkspace',
    'aiConfig.chatStorage': 'workspace',
    'aiConfig.chatMode': 'workspace',
} as const satisfies Partial<Record<AppSettingPath, 'workspace' | 'trustedWorkspace'>>

type Overridable = keyof typeof WORKSPACE_OVERRIDABLE

/** How `path` may be overridden, from the entry covering it; `undefined` = global only. */
export function overridableAs(path: string): 'workspace' | 'trustedWorkspace' | undefined {
    const entry = (Object.keys(WORKSPACE_OVERRIDABLE) as Overridable[]).find(k => path === k || path.startsWith(`${k}.`))
    return entry && WORKSPACE_OVERRIDABLE[entry]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function getAt(target: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((node, key) => (isObject(node) ? node[key] : undefined), target)
}

/** A copy of `target` with `value` at `path`. */
export function withAt<T>(target: T, path: string, value: unknown): T {
    const [key, ...rest] = path.split('.') as [string, ...string[]]
    const node: Record<string, unknown> = isObject(target) ? target : {}
    return {...node, [key]: rest.length ? withAt(node[key], rest.join('.'), value) : value} as T
}

function merge(base: unknown, over: unknown): unknown {
    if (!isObject(base) || !isObject(over)) return over === undefined ? base : over
    const out: Record<string, unknown> = {...base}
    for (const [key, value] of Object.entries(over)) out[key] = merge(base[key], value)
    return out
}

/** Whether the workspace overrides `path` (or, for a section, anything in it). */
export function isOverridden(local: DeepPartial<AppSettings>, path: string): boolean {
    const value = getAt(local, path)
    return value !== undefined && !(isObject(value) && Object.keys(value).length === 0)
}

/** The overrides that apply: allowlisted, and the trusted-only ones only in a trusted workspace. */
export function applicableOverrides(local: DeepPartial<AppSettings>, trusted: boolean): DeepPartial<AppSettings> {
    let out: DeepPartial<AppSettings> = {}
    for (const [path, level] of Object.entries(WORKSPACE_OVERRIDABLE)) {
        const value = getAt(local, path)
        if (value !== undefined && (level === 'workspace' || trusted)) out = withAt(out, path, value)
    }
    return out
}

/** A window's settings: the global ones with its workspace's applicable overrides on top, sanitized as one. */
export function effectiveSettings(global: AppSettings, local: DeepPartial<AppSettings>, trusted: boolean): AppSettings {
    return defaultAppSettings(merge(global, applicableOverrides(local, trusted)) as DeepPartial<AppSettings>)
}
