import {corePlugins} from '#build/core-plugins.mjs'
import type {PluginEntry} from '#shared/plugin/api'
import type {PluginManifest} from '#shared/plugin/manifest'

/** Nuxt declares every generated template as an untyped module; `modules/core-plugins.ts` writes exactly this shape. */
const core: readonly PluginEntry[] = corePlugins

/** Every plugin this build runs: the core plugins (`layers/*`). The host's list. */
export const pluginEntries = (): readonly PluginEntry[] => core

/**
 * The plugins a user can turn on and off and configure: the core plugins (installed ones join in the C phases). The
 * source for the settings scopes (each manifest's `config.overridable`) and Settings → Plugins.
 */
export const pluginManifests = (): PluginManifest[] => core.map(e => e.manifest)

export const pluginManifest = (id: string): PluginManifest | undefined => core.find(e => e.manifest.id === id)?.manifest
