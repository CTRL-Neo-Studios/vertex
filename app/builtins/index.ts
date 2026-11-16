import type {PluginEntry} from '#shared/plugin/api'
import type {PluginManifest} from '#shared/plugin/manifest'

const builtin = (manifest: Pick<PluginManifest, 'id' | 'name' | 'windows'>, load: PluginEntry['load']): PluginEntry =>
    ({manifest: {version: '0', apiVersion: 1, ...manifest}, source: 'builtin', load})

/**
 * Features not extracted into their layers yet (Plugin Architecture Plan, X phases): each registers through the same
 * `ctx` a plugin gets, from code that still lives in the kernel's folders. They're always on and not in Settings →
 * Plugins, as turning one off would leave pieces of it behind. Each X phase moves one into `layers/<id>/` and removes it
 * here; with this list empty, the `builtin` source goes.
 */
export const builtinPlugins: readonly PluginEntry[] = [
    // Builtins with panel views run in Settings too, where View → Panels arranges them.
    builtin({id: 'files', name: 'Files', windows: ['session', 'settings']}, () => import('./files')),
    builtin({id: 'palette', name: 'Command palette', windows: ['session', 'settings']}, () => import('./palette')),
    builtin({id: 'outline', name: 'Outline', windows: ['session', 'settings']}, () => import('./outline')),
    builtin({id: 'backlinks', name: 'Backlinks', windows: ['session', 'settings']}, () => import('./backlinks')),
    builtin({id: 'outgoing-links', name: 'Outgoing links', windows: ['session', 'settings']}, () => import('./outgoing-links')),
    builtin({id: 'writers-tools', name: 'Writer\'s tools', windows: ['session', 'settings']}, () => import('./writers-tools')),
    builtin({id: 'image', name: 'Image'}, () => import('./image')),
    builtin({id: 'mermaid', name: 'Mermaid'}, () => import('./mermaid')),
    builtin({id: 'yaml-form', name: 'YAML form'}, () => import('./yaml-form')),
    builtin({id: 'latex', name: 'LaTeX'}, () => import('./latex')),
    builtin({id: 'canvas', name: 'Canvas'}, () => import('./canvas')),
    builtin({id: 'bases', name: 'Bases'}, () => import('./bases')),
    builtin({id: 'workflows', name: 'Workflows', windows: ['session', 'settings']}, () => import('./workflows')),
    builtin({id: 'git', name: 'Git', windows: ['main', 'session', 'settings']}, () => import('./git')),
    builtin({id: 'ai', name: 'AI', windows: ['session', 'settings']}, () => import('./ai')),
    builtin({id: 'ai-assistant', name: 'AI assistant'}, () => import('./ai-assistant')),
    builtin({id: 'chat', name: 'Chat', windows: ['session', 'settings']}, () => import('./chat')),
]
