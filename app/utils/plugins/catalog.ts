import {corePlugins} from '#build/core-plugins.mjs'
import type {PluginEntry} from '#shared/plugin/api'
import type {PluginManifest} from '#shared/plugin/manifest'

/** Nuxt declares every generated template as an untyped module; `modules/core-plugins.ts` writes exactly this shape. */
const core: readonly PluginEntry[] = corePlugins

/**
 * Every plugin this build knows: the core plugins (`layers/*`). The single source for the host, the settings scopes
 * (each manifest's `config.overridable`) and Settings → Plugins; installed plugins join it in the C phases.
 */
export const pluginEntries = (): readonly PluginEntry[] => core

export const pluginManifests = (): PluginManifest[] => core.map(e => e.manifest)

export const pluginManifest = (id: string): PluginManifest | undefined => core.find(e => e.manifest.id === id)?.manifest
