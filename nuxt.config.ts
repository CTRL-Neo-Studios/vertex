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
      "@comark/vue",
      "@type32/jsoncanvas-editor",
    ],

	i18n: {
		defaultLocale: 'en',
		// Desktop app: routes never carry a locale prefix; the language comes from app settings
		// (applied in plugins/initialize.client.ts), not from the URL, cookies or browser detection.
		strategy: 'no_prefix',
		detectBrowserLanguage: false,
		locales: [
			{ code: 'en', name: 'English', file: 'en.json' },
			{ code: 'zh-CN', name: '简体中文', file: 'zh-CN.json' }
		]
	},

    css: ["~/assets/css/main.css", "@type32/workflows/vue/style.css"],

    // The workflow canvas ships compiled SFCs that import Nuxt UI components by path; let Vite process them.
    build: {transpile: ["@type32/workflows"]},

    hooks: {
        // @type32/codemirror-rich-obsidian-editor 0.2.3 adds the CommonJS `alfaaz` to build.transpile, which keeps it
        // out of pre-bundling; served raw, its named imports fail and every window shows a 500. Pre-bundle it again.
        'vite:extendConfig'(config) {
            const deps = config.optimizeDeps
            if (deps?.exclude) deps.exclude = deps.exclude.filter(dep => dep !== 'alfaaz')
        },
    },

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

    // Model vendor logos (Settings → Assistive AI, `ModelBadges.vue`): picked at runtime, so bundle them.
    icon: {
        clientBundle: {
            icons: [
                'simple-icons:openai', 'simple-icons:anthropic', 'simple-icons:googlegemini', 'simple-icons:meta',
                'simple-icons:mistralai', 'simple-icons:deepseek', 'simple-icons:qwen', 'simple-icons:alibabacloud',
                'simple-icons:microsoft', 'simple-icons:nvidia', 'simple-icons:perplexity', 'simple-icons:ollama',
                'simple-icons:huggingface', 'simple-icons:amazon', 'simple-icons:ibm', 'simple-icons:moonshotai',
                'simple-icons:minimax', 'simple-icons:openrouter',
            ],
        },
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
                "@tauri-apps/plugin-updater",
                // Files' native drag (app/utils/outsideItems.ts); found at runtime otherwise, which reloads the window.
                "@crabnebula/tauri-plugin-drag",
                // Nuxt DevTools' client; discovered late otherwise, which reloads the page.
                "@vue/devtools-core",
                "@tauri-apps/api/event",
                "@tauri-apps/api/core",
                "@tauri-apps/api/dpi",
                // Imported by pages/settings/index.vue; found at runtime otherwise, which reloads the page mid-load ("head.hooks").
                "@tauri-apps/api/app",
                "tailwindcss/colors",
                "pele",
                "ai",
                "@ai-sdk/openai-compatible",
                "@ai-sdk/vue",
                // Comark: the <Markdown> its Nuxt module auto-imports, and the subpaths the chat imports.
                "@comark/vue",
                "@comark/vue/utils",
                "@comark/vue/plugins/math",
                "@comark/vue/plugins/rangi",
                // Loaded by Comark's math plugin (and the editor's math widgets) with a dynamic import.
                "katex",
                "@type32/obsidian-bases-parser",
                // Bases: cell HTML (Value.vue) and the formula field's completion; found when a base first opens otherwise,
                // which reloads the window.
                "xss",
                "@codemirror/autocomplete",
                "@type32/latex2vue",
                "zod",
                "@vue-flow/core",
                "alfaaz",
                // Diff views (shared/utils/textDiff.ts); found at runtime otherwise, which reloads the window.
                "diff",
                // The chat's `bash` tool (app/utils/chatBash.ts), imported on its first command; same reason.
                "just-bash",
                // fetchUrl (app/utils/webPage.ts); the tool imports linkedom and defuddle on the first HTML page.
                "@ai-sdk/tool-web-fetch",
                "linkedom",
                "defuddle/node",
            ],
            // Pre-bundling would hide its `@nuxt/ui/components/*.vue` imports from the Vue plugin.
            // exclude: ["@type32/workflows"]
        },
    },
});
