export default defineNuxtConfig({
    components: [{path: 'components', prefix: 'Latex'}],
    vite: {optimizeDeps: {include: ['@type32/latex2vue']}},
})
