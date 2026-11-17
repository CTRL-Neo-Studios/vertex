import {fileURLToPath} from 'node:url'

export default defineNuxtConfig({
    // Comark draws replies: `<Markdown>` from its Nuxt module.
    modules: ['@comark/vue'],
    components: [{path: 'components', prefix: 'Chat'}],
    // Highlighted code in replies carries its dark colour in `--shiki-dark`.
    css: [fileURLToPath(new URL('./app/assets/chat.css', import.meta.url))],
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
    vite: {
        optimizeDeps: {
            // Found at runtime otherwise, which reloads the window: Comark's subpaths and the editor's `ofm()`, the `bash`
            // tool's sandbox (imported on its first command), and fetchUrl's tool, which imports linkedom and defuddle on
            // the first HTML page.
            include: [
                '@ai-sdk/vue', '@comark/vue', '@comark/vue/utils', '@comark/vue/plugins/math', '@comark/vue/plugins/rangi',
                '@type32/codemirror-rich-obsidian-editor/comark',
                'just-bash', '@ai-sdk/tool-web-fetch', 'linkedom', 'defuddle/node',
            ],
        },
    },
})
