export default defineNuxtConfig({
    components: [{path: 'components', prefix: 'BasesMap'}],
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
    // Its worker is set by URL in View.vue; found at runtime otherwise, which reloads the window.
    vite: {optimizeDeps: {include: ['maplibre-gl']}},
})
