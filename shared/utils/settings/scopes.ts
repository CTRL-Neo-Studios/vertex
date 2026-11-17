import type {AppSettings} from "#shared/types/app/settings";
import type {DeepPartial} from "#shared/types/types";
import type {OverrideLevel, PluginManifest} from "#shared/plugin/manifest";
import {defaultAppSettings} from "#shared/utils/defaults/apps";
import {getAt, isPlainObject, withAt} from "#shared/utils/settings/paths";

/**
 * Global and workspace settings (VS Code's User and Workspace). There's one `AppSettings` type: a workspace's
 * `.vertex/settings.json` is a `DeepPartial<AppSettings>` holding only what it changes, and the allowlist says which
 * settings it may change: the kernel's (`WORKSPACE_OVERRIDABLE`) and each plugin's (its manifest's
 * `config.overridable`). Everything else (trust, updates, sessions, language, workflow limits) stays global.
 */

/** Every dotted path into `T`, objects included: `themeConfig`, `themeConfig.primaryColor`. */
export type SettingPath<T> = {
    [K in keyof T & string]-?: NonNullable<T[K]> extends readonly unknown[]
        ? K
        : NonNullable<T[K]> extends object ? K | `${K}.${SettingPath<NonNullable<T[K]>>}` : K
}[keyof T & string]

/** The type at a path; `unknown` for one the type doesn't know (a plugin's config without `PluginConfigs`). */
export type SettingAt<T, P extends string> = P extends `${infer K}.${infer Rest}`
    ? K extends keyof T ? SettingAt<NonNullable<T[K]>, Rest> : unknown
    : P extends keyof T ? T[P] : unknown

/** A plugin's config paths are typed through `PluginConfigs`; a plugin that doesn't declare its config still has them. */
export type AppSettingPath = SettingPath<AppSettings> | `plugins.config.${string}`

/** Path → who may override it; an entry covers everything under it. */
export type Allowlist = Readonly<Record<string, OverrideLevel>>

/**
 * What a workspace may override of the kernel's settings. `trustedWorkspace` only applies when the workspace's folder
 * is trusted (Settings → Workflows): custom CSS can restyle or hide anything, the trust prompt included, and load remote
 * URLs. Making another setting overridable is one line here.
 */
export const WORKSPACE_OVERRIDABLE = {
    themeConfig: 'workspace',
    viewConfig: 'workspace',
    'advancedThemeConfig.customCss': 'trustedWorkspace',
    // A shared vault's settings mustn't start committing and pushing a user's edits on their own.
    'gitConfig.autoSync': 'trustedWorkspace',
    fileConfig: 'workspace',
    // Value-aware (`applicableOverrides`): any workspace may turn a plugin off; only a trusted one may turn one on, as
    // that runs its code with the vault.
    'plugins.enabled': 'workspace',
} as const satisfies Partial<Record<AppSettingPath, OverrideLevel>>

/** The kernel's allowlist with each plugin's `config.overridable`, under `plugins.config.<id>`. */
export function settingsAllowlist(manifests: readonly PluginManifest[]): Allowlist {
    const out: Record<string, OverrideLevel> = {...WORKSPACE_OVERRIDABLE}
    for (const manifest of manifests) {
        for (const [path, level] of Object.entries(manifest.config?.overridable ?? {})) out[`plugins.config.${manifest.id}.${path}`] = level
    }
    return out
}

/** How `path` may be overridden, from the entry covering it; `undefined` = global only. */
export function overridableAs(path: string, allowlist: Allowlist): OverrideLevel | undefined {
    const entry = Object.keys(allowlist).find(k => path === k || path.startsWith(`${k}.`))
    return entry ? allowlist[entry] : undefined
}

function merge(base: unknown, over: unknown): unknown {
    if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over
    const out: Record<string, unknown> = {...base}
    for (const [key, value] of Object.entries(over)) out[key] = merge(base[key], value)
    return out
}

/** Whether the workspace overrides `path` (or, for a section, anything in it). */
export function isOverridden(local: DeepPartial<AppSettings>, path: string): boolean {
    const value = getAt(local, path)
    return value !== undefined && !(isPlainObject(value) && Object.keys(value).length === 0)
}

/** The overrides that apply: allowlisted, the trusted-only ones only in a trusted workspace, and plugins turned on only there. */
export function applicableOverrides(local: DeepPartial<AppSettings>, trusted: boolean, allowlist: Allowlist): DeepPartial<AppSettings> {
    let out: DeepPartial<AppSettings> = {}
    for (const [path, level] of Object.entries(allowlist)) {
        const value = getAt(local, path)
        if (value === undefined || (level === 'trustedWorkspace' && !trusted)) continue
        if (path === 'plugins.enabled') {
            for (const [id, on] of Object.entries(isPlainObject(value) ? value : {})) {
                if (on === false || (on === true && trusted)) out = withAt(out, `plugins.enabled.${id}`, on)
            }
            continue
        }
        out = withAt(out, path, value)
    }
    return out
}

/** A window's settings: the global ones with its workspace's applicable overrides on top, sanitized as one. */
export function effectiveSettings(global: AppSettings, local: DeepPartial<AppSettings>, trusted: boolean, allowlist: Allowlist): AppSettings {
    return defaultAppSettings(merge(global, applicableOverrides(local, trusted, allowlist)) as DeepPartial<AppSettings>)
}
