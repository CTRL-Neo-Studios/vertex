import type {PluginEntry} from '#shared/plugin/api'
import {validateManifest} from '#shared/plugin/manifest'
import manifests from './plugins.json'

/** Each built-in's entry, by its id in `plugins.json`. */
const LOAD: Record<string, PluginEntry['load']> = {
    'git': () => import('./git'),
    'ai': () => import('./ai'),
    'ai-assistant': () => import('./ai-assistant'),
    'chat': () => import('./chat'),
}

/**
 * Features not extracted into their layers yet (Plugin Architecture Plan, X phases): each registers through the same
 * `ctx` a plugin gets, from code that still lives in the kernel's folders. Their manifests are `plugins.json`, which
 * Rust embeds too (what a window where one is on may call); those with panel views run in Settings too, where View →
 * Panels arranges them. They turn off like any plugin. What the kernel still wires to one directly stays until its X
 * phase (git's commit-message button asks AI with `ai` off). Each X phase moves one into `layers/<id>/` and removes it
 * here; with this list empty, the `builtin` source goes.
 */
export const builtinPlugins: readonly PluginEntry[] = manifests.map(raw => {
    const result = validateManifest(raw)
    if (!result.ok) throw new Error(`built-in "${raw.id}": ${result.errors.join('; ')}`)
    const load = LOAD[result.manifest.id]
    if (!load) throw new Error(`built-in "${raw.id}" has no entry in app/builtins/index.ts`)
    return {manifest: result.manifest, source: 'builtin', load}
})
