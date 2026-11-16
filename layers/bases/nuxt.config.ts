export default defineNuxtConfig({
    components: [{path: 'components', prefix: 'Bases'}],
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
    // Cell HTML (Value.vue) and the formula field's completion; found when a base first opens otherwise, which reloads
    // the window.
    vite: {optimizeDeps: {include: ['xss', '@codemirror/autocomplete']}},
})
