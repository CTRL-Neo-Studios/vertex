export default defineNuxtConfig({
    // `<JsonCanvas>` and its styles.
    modules: ['@type32/jsoncanvas-editor'],
    components: [{path: 'components', prefix: 'Canvas'}],
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
})
