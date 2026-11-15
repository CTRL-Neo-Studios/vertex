import {corePlugins} from '#build/core-plugins.mjs'
import type {PluginEntry} from '#shared/plugin/api'
import type {PluginManifest} from '#shared/plugin/manifest'
import {builtinPlugins} from '~/builtins'

/** Nuxt declares every generated template as an untyped module; `modules/core-plugins.ts` writes exactly this shape. */
const core: readonly PluginEntry[] = corePlugins

const all = [...core, ...builtinPlugins]
const clash = all.find((e, i) => all.findIndex(o => o.manifest.id === e.manifest.id) !== i)
// An X phase moving a built-in into its layer removes it from `builtinPlugins` in the same change.
if (clash) throw new Error(`plugin "${clash.manifest.id}" is both a layer and a built-in`)

/** Every plugin this build runs: the core plugins (`layers/*`) and the built-ins (`app/builtins/`). The host's list. */
export const pluginEntries = (): readonly PluginEntry[] => all

/** Built-ins are always on, whatever `plugins.enabled` says. */
export const isBuiltin = (id: string) => builtinPlugins.some(e => e.manifest.id === id)

/**
 * The plugins a user can turn on and off and configure: the core plugins (installed ones join in the C phases). The
 * source for the settings scopes (each manifest's `config.overridable`) and Settings → Plugins.
 */
export const pluginManifests = (): PluginManifest[] => core.map(e => e.manifest)

export const pluginManifest = (id: string): PluginManifest | undefined => core.find(e => e.manifest.id === id)?.manifest
