export default defineNuxtConfig({
    devtools: {enabled: false},

    modules: [
        "@nuxt/ui",
        "nuxt-auth-utils",
        "@vueuse/nuxt",
        "@nuxt/image",
        "@nuxt/icon",
        "@nuxt/fonts",
        "@nuxtjs/i18n",
        "@type32/codemirror-rich-obsidian-editor",
        "@type32/dispatcher",
        "@type32/nuxt-predicates",
    ],

    css: ["~/assets/css/main.css"],

    compatibilityDate: "2026-01-14",

    fonts: {
        families: [
            {name: 'SF Pro', provider: 'local'},
            {name: 'SF Mono', provider: 'local'},
            {name: 'SF-Pro', provider: 'local'},
            {name: 'SF-Mono', provider: 'local'},
        ]
    },

    // Enable SSG
    ssr: false,
    ignore: ['**/src-tauri/**'],
    // Enables the development server to be discoverable by other devices when running on iOS physical devices
    devServer: {
        host: '0',
    },
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
                "@tauri-apps/plugin-os",
                "@tauri-apps/plugin-opener",
                "@type32/codemirror-rich-obsidian-editor",
                "compromise",
                "reka-ui",
                "@tauri-apps/api/menu",
                "@tauri-apps/api/webviewWindow",
                "@tauri-apps/api/webview",
                "@tauri-apps/api/window",
                "@tauri-apps/plugin-process",
                "@tauri-apps/api/event",
                "@tauri-apps/api/core",
                "tailwindcss/colors",
                "@vueuse/integrations/useSortable",
                "sortablejs",
                "vue-mermaid-string"
            ]
        },
    },
});