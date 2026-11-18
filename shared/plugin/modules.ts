/**
 * The modules a community plugin imports and gets the host's copy of, so there is one Vue, one CodeMirror, one editor
 * and one Nuxt UI: the host puts them on `globalThis[SHARED_GLOBAL]` (`app/utils/plugins/community.ts`), and the SDK's
 * preset turns each import of them into a read from there (`packages/vertex-plugin`). A shared package's new major is a
 * new `apiVersion`. Nuxt UI's components aren't imported: the host registers every one globally, by name.
 */
export const SHARED_GLOBAL = '__vertexModules'

/** Packages, by the specifier a plugin imports. */
export const SHARED_PACKAGES = [
    'vue',
    '@codemirror/autocomplete',
    '@codemirror/commands',
    '@codemirror/lang-markdown',
    '@codemirror/language',
    '@codemirror/language-data',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/markdown',
    '@type32/codemirror-rich-obsidian-editor',
    '@type32/codemirror-rich-obsidian-editor/kit',
    '@type32/codemirror-rich-obsidian-editor/ext',
    '@nuxt/ui/composables',
] as const

/**
 * The SDK's own modules, by the kernel source each is: a core plugin's `#shared/plugin/vault` is a community plugin's
 * `@type32/vertex-plugin/vault`.
 */
export const SDK_MODULES = {
    '@type32/vertex-plugin': 'shared/plugin/api.ts',
    '@type32/vertex-plugin/files': 'shared/plugin/files.ts',
    '@type32/vertex-plugin/links': 'shared/plugin/links.ts',
    '@type32/vertex-plugin/text': 'shared/plugin/text.ts',
    '@type32/vertex-plugin/vault': 'shared/plugin/vault.ts',
    '@type32/vertex-plugin/ui': 'app/plugin/ui.ts',
} as const

export type SharedModuleId = typeof SHARED_PACKAGES[number] | keyof typeof SDK_MODULES

/**
 * Those of `names` a plugin's built code names as a string (`resolveComponent("UButton")`, what a template's
 * `<UButton>` compiles to, in any quotes): the components it can draw, without running it.
 */
export const namedIn = (code: string, names: Iterable<string>) =>
    [...names].filter(name => ['"', '\'', '`'].some(quote => code.includes(`${quote}${name}${quote}`)))
