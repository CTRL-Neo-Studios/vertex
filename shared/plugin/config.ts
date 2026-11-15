import {getAt, isPlainObject, withAt} from '#shared/utils/settings/paths'
import type {ConfigField, PluginManifest} from './manifest'

/** `value` when it fits the field, else the field's default (a number is clamped to its range). */
export function sanitizeField(field: ConfigField, value: unknown): unknown {
    switch (field.type) {
        case 'switch':
            return typeof value === 'boolean' ? value : field.default
        case 'text':
        case 'color':
            return typeof value === 'string' ? value : field.default
        case 'path':
            return typeof value === 'string' ? value.replace(/^\/+|\/+$/g, '') : field.default
        case 'number':
            return typeof value === 'number' && Number.isFinite(value)
                ? Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, value))
                : field.default
        case 'select':
            return field.options.some(o => o.value === value) ? value : field.default
        case 'list':
            return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [...field.default]
    }
}

/**
 * A plugin's config as it runs: what's stored (the window's effective settings), with each schema field checked and
 * defaulted. Keys outside the schema pass as stored; a plugin with its own settings page checks those itself.
 */
export function pluginConfig(manifest: PluginManifest, stored: unknown): Record<string, unknown> {
    let out: Record<string, unknown> = isPlainObject(stored) ? stored : {}
    for (const field of manifest.config?.schema ?? []) out = withAt(out, field.key, sanitizeField(field, getAt(out, field.key)))
    return out
}
