export default defineNuxtConfig({
    components: [{path: 'components', prefix: 'WritersTools'}],
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
    // The editor's word and line counts (`useDocumentUtils`); found when the counter first draws otherwise, which reloads the window.
    vite: {optimizeDeps: {include: ['alfaaz']}},
})
