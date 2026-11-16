export default defineNuxtConfig({
    components: [{path: 'components', prefix: 'Workflow'}],
    // The workflow canvas's styles. Its classes are Nuxt UI's, which `main.css` scans the package for (`@source`).
    css: ['@type32/workflows/vue/style.css'],
    // The canvas ships compiled SFCs that import Nuxt UI components by path; let Vite process them.
    build: {transpile: ['@type32/workflows']},
    i18n: {locales: [{code: 'en', file: 'en.json'}, {code: 'zh-CN', file: 'zh-CN.json'}]},
})
