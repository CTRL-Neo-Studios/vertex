import {SHARED_PACKAGES} from './shared/plugin/modules'

/**
 * A Nuxt module whose runtime the app imports as source (its aliases, its components). Pre-bundling `/kit` or `/ext`
 * gives the app a second copy of the kit: the block handle and other widgets then mount without the app
 * (`vueContextFacet` unset). Chat's layer still pre-bundles `/comark` (`ofm()`, parsing only).
 */
const EDITOR = '@type32/codemirror-rich-obsidian-editor'

export default defineNuxtConfig({
    devtools: {enabled: true},
    $production: {devtools: {enabled: false}},

    modules: [
      "@nuxt/ui",
      "@vueuse/nuxt",
      "@nuxt/icon",
      "@nuxt/fonts",
      "@nuxtjs/i18n",
      "@type32/codemirror-rich-obsidian-editor/nuxt",
      "@type32/nuxt-predicates",
      "@type32/yaml-editor-form",
      // `<Markdown>` and Nuxt UI's prose: the kernel's MarkdownText and Chat's replies.
      "@comark/vue",
      "@nuxt/eslint",
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
                "ai",
                "@ai-sdk/openai-compatible",
                // Loaded by the editor's math widgets with a dynamic import.
                "katex",
                "@type32/obsidian-bases-parser",
                "zod",
                "@vue-flow/core",
                // Diff views (shared/utils/textDiff.ts); found at runtime otherwise, which reloads the window.
                "diff",
                // The installed icon sets' loader (app/plugins/icons.client.ts); found at runtime otherwise, which
                // reloads the window mid-load ("head.hooks").
                "@iconify/vue",
                "@iconify/utils",
                // Settings → Theme's CSS editor (app/components/Settings/CssEditor.vue).
                "@codemirror/lang-css",
                "@catppuccin/codemirror",
                // A stranger's Markdown (app/components/MarkdownText.vue: a plugin's README).
                "@comark/vue",
                "comark/plugins/frontmatter",
                "comark/plugins/linkify",
                "comark/plugins/security",
                "comark/plugins/task-list",
                // What community plugins get from the app (`app/utils/plugins/community.ts`, loaded with the first one);
                // found at runtime otherwise, which reloads every window, and again with each plugin a window loads.
                ...SHARED_PACKAGES.filter(p => p !== EDITOR && !p.startsWith(`${EDITOR}/`)),
            ],
            // Every entry of the package (`pkgId`), its subpaths included.
            exclude: [EDITOR],
        },
    },
});
