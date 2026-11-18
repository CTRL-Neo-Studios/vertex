/**
 * Community plugins' code: what it imports from the host, and running it. Loaded only where a community plugin runs
 * (by the loader), so its namespace imports keep every shared module whole in its own chunk, not in the app's.
 * Nuxt UI is the app's for them too: its composables are a shared module, its components are registered globally (and
 * looked up by name for an import of one's file, `NUXT_UI_COMPONENT`).
 */
import * as autocomplete from '@codemirror/autocomplete'
import * as commands from '@codemirror/commands'
import * as langMarkdown from '@codemirror/lang-markdown'
import * as language from '@codemirror/language'
import * as languageData from '@codemirror/language-data'
import * as lint from '@codemirror/lint'
import * as search from '@codemirror/search'
import * as state from '@codemirror/state'
import * as view from '@codemirror/view'
import * as internationalizedDate from '@internationalized/date'
import * as lezerCommon from '@lezer/common'
import * as lezerHighlight from '@lezer/highlight'
import * as lezerMarkdown from '@lezer/markdown'
import * as nuxtUiComposables from '@nuxt/ui/composables'
import * as editor from '@type32/codemirror-rich-obsidian-editor'
import * as editorExt from '@type32/codemirror-rich-obsidian-editor/ext'
import * as editorKit from '@type32/codemirror-rich-obsidian-editor/kit'
import {defineAsyncComponent, type App, type Component} from 'vue'
import * as vue from 'vue'
import {nuxtUiComponents} from '#build/nuxt-ui-components.mjs'
import * as api from '#shared/plugin/api'
import * as files from '#shared/plugin/files'
import * as links from '#shared/plugin/links'
import {namedIn, NUXT_UI_COMPONENT, SHARED_GLOBAL, type SharedModuleId} from '#shared/plugin/modules'
import * as text from '#shared/plugin/text'
import * as vault from '#shared/plugin/vault'
import * as ui from '~/plugin/ui'

/** Nuxt declares every generated template as an untyped module; `modules/nuxt-ui-components.ts` writes exactly this shape. */
const NUXT_UI_COMPONENTS: Record<string, () => Promise<Component>> = nuxtUiComponents

const MODULES: Record<SharedModuleId, object> = {
    'vue': vue,
    '@codemirror/autocomplete': autocomplete,
    '@codemirror/commands': commands,
    '@codemirror/lang-markdown': langMarkdown,
    '@codemirror/language': language,
    '@codemirror/language-data': languageData,
    '@codemirror/lint': lint,
    '@codemirror/search': search,
    '@codemirror/state': state,
    '@codemirror/view': view,
    '@internationalized/date': internationalizedDate,
    '@lezer/common': lezerCommon,
    '@lezer/highlight': lezerHighlight,
    '@lezer/markdown': lezerMarkdown,
    '@type32/codemirror-rich-obsidian-editor': editor,
    '@type32/codemirror-rich-obsidian-editor/kit': editorKit,
    '@type32/codemirror-rich-obsidian-editor/ext': editorExt,
    '@type32/vertex-plugin': api,
    '@type32/vertex-plugin/files': files,
    '@type32/vertex-plugin/links': links,
    '@type32/vertex-plugin/text': text,
    '@type32/vertex-plugin/vault': vault,
    '@type32/vertex-plugin/ui': ui,
    '@nuxt/ui/composables': nuxtUiComposables,
}

/** Nuxt UI's components as registered for plugins, by name: lazy, until a plugin's code names one. Vue's own types leave `__asyncLoader` out. */
const lazy = new Map<string, Component & { __asyncLoader(): Promise<unknown> }>()

/**
 * Runs a community plugin's `main.js` (built with the SDK) from a blob URL, so what runs is exactly `code`, and returns
 * its module. The first time, puts the host's shared modules on `globalThis` for its imports, and registers Nuxt UI's
 * components on `app` by the names the app's templates use (`<UButton>`). The ones `code` names are loaded before it
 * runs; any other (a name made at run time) loads when first drawn.
 */
export async function importPluginCode(code: string, app: App): Promise<{ default?: unknown }> {
    const g = globalThis as Record<string, unknown>
    if (!g[SHARED_GLOBAL]) {
        g[SHARED_GLOBAL] = Object.freeze({...MODULES, [NUXT_UI_COMPONENT]: (name: string) => app.component(name)})
        for (const [name, load] of Object.entries(NUXT_UI_COMPONENTS)) {
            // Nuxt registers some globally itself (the prose components).
            if (app.component(name)) continue
            lazy.set(name, defineAsyncComponent(load) as Component & { __asyncLoader(): Promise<unknown> })
            app.component(name, lazy.get(name)!)
        }
    }
    // A component still loading has no element, and one drawn inside another's trigger (a button in a tooltip) is read
    // by Reka at once (`$el.nodeName`): the plugin's view threw the first time it drew. Loaded, Vue draws it at once
    // (`__asyncLoader`, what Nuxt preloads its own lazy components with). One that fails to load fails when drawn.
    await Promise.allSettled(namedIn(code, lazy.keys()).map(name => lazy.get(name)!.__asyncLoader()))
    const url = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}))
    try {
        return await import(/* @vite-ignore */ url)
    } finally {
        URL.revokeObjectURL(url)
    }
}
