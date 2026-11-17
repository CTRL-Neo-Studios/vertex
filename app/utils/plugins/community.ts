/**
 * Community plugins' code: what it imports from the host, and running it. Loaded only where a community plugin runs
 * (by the loader), so its namespace imports keep every shared module whole in its own chunk, not in the app's.
 * Nuxt UI is the app's for them too: its composables are a shared module, its components are registered globally.
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
import {SHARED_GLOBAL, type SharedModuleId} from '#shared/plugin/modules'
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

/**
 * Runs a community plugin's `main.js` (built with the SDK) from a blob URL, so what runs is exactly `code`, and returns
 * its module. The first time, puts the host's shared modules on `globalThis` for its imports, and registers Nuxt UI's
 * components on `app` by the names the app's templates use (`<UButton>`), each loaded when first drawn.
 */
export async function importPluginCode(code: string, app: App): Promise<{ default?: unknown }> {
    const g = globalThis as Record<string, unknown>
    if (!g[SHARED_GLOBAL]) {
        g[SHARED_GLOBAL] = Object.freeze({...MODULES})
        // Nuxt registers some globally itself (the prose components).
        for (const [name, load] of Object.entries(NUXT_UI_COMPONENTS)) if (!app.component(name)) app.component(name, defineAsyncComponent(load))
    }
    const url = URL.createObjectURL(new Blob([code], {type: 'text/javascript'}))
    try {
        return await import(/* @vite-ignore */ url)
    } finally {
        URL.revokeObjectURL(url)
    }
}
