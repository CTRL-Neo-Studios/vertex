export default defineNuxtConfig({
    components: [{path: 'components', prefix: 'NowPlaying'}],
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
})
