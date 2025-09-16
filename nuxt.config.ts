export default defineNuxtConfig({
    devtools: {enabled: false},

    modules: ["@nuxt/ui", "nuxt-auth-utils", "@vueuse/nuxt", "@nuxt/image", "@nuxt/icon", "@nuxt/fonts", "@nuxtjs/i18n", "@type32/codemirror-rich-obsidian-editor"],

    css: ["~/assets/css/main.css"],

    compatibilityDate: "2025-09-04",

    fonts: {
        families: [
            {name: 'SF-Pro', provider: 'local'},
            {name: 'SF-Mono', provider: 'local'}
        ]
    },

    // Enable SSG
    ssr: false,
    // Enables the development server to be discoverable by other devices when running on iOS physical devices
    devServer: {host: process.env.TAURI_DEV_HOST || "localhost"},
    vite: {
        // Better support for Tauri CLI output
        clearScreen: false,
        // Enable environment variables
        // Additional environment variables can be found at
        // https://v2.tauri.app/reference/environment-variables/
        envPrefix: ["VITE_", "TAURI_"],
        server: {
            // Tauri requires a consistent port
            strictPort: true,
        },
        optimizeDeps: {
            include: [
                "@tauri-apps/plugin-store",
                "@tauri-apps/plugin-fs",
                "@tauri-apps/plugin-dialog",
                "@tauri-apps/plugin-clipboard-manager",
                "@tauri-apps/api/path",
                "@type32/codemirror-rich-obsidian-editor",
                "reka-ui"
            ]
        }
    }
});