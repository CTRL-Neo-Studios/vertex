export default defineNuxtConfig({
    components: [{path: 'components', prefix: 'Backlinks'}],
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
})
