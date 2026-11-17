import {fileURLToPath} from 'node:url'

export default defineNuxtConfig({
    components: [{path: 'components', prefix: 'Git'}],
    // The tour's outline around the element a step points at.
    css: [fileURLToPath(new URL('./app/assets/tour.css', import.meta.url))],
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
})
