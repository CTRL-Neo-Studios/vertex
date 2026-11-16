export default defineNuxtConfig({
    components: [{path: 'components', prefix: 'YamlForm'}],
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
})
