export default defineNuxtConfig({
    devtools: {enabled: true},
    $production: {devtools: {enabled: false}},

    modules: [
      "@nuxt/ui",
      "@vueuse/nuxt",
      "@nuxt/icon",
      "@nuxt/fonts",
      "@nuxtjs/i18n",
      "@type32/codemirror-rich-obsidian-editor",
      "@type32/dispatcher",
      "@type32/nuxt-predicates",
      "@type32/yaml-editor-form",
      "@nuxt/eslint",
    ],

	i18n: {
		defaultLocale: 'en',
		locales: [
			{ code: 'en', name: 'English', file: 'en.json' },
			{ code: 'zh-CN', name: '简体中文', file: 'zh-CN.json' }
		]
	},

    css: ["~/assets/css/main.css"],

    compatibilityDate: "2026-10-14",

    fonts: {
        priority: ['local', 'google'],
        families: [
            {name: 'SF Pro', provider: 'local'},
            {name: 'SF Mono', provider: 'local'},
            {name: 'Inter', provider: 'local'},
            {name: 'Inter Variable', provider: 'local'},
            {name: 'Inter Display', provider: 'local'},
            {name: 'Geist', provider: 'local'},
            {name: 'Geist Mono', provider: 'local'},
        ]
    },

    // SPA: `nuxt generate` emits static files that Tauri serves; there is no server at runtime.
    ssr: false,
    ignore: ['**/src-tauri/**'],
    // Enables the development server to be discoverable by other devices when running on iOS physical devices
    devServer: {host: '127.0.0.1',},
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
                "@tauri-apps/plugin-notification",
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
                "vue-mermaid-string",
                "@type32/obsidian-bases-parser",
                "@type32/latex2vue",
                "zod"
            ]
        },
    },
});
