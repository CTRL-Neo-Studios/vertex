import LaTeX2Vue from '@type32/latex2vue';

export default defineNuxtPlugin((nuxtApp) => {
    nuxtApp.vueApp.use(LaTeX2Vue);
});