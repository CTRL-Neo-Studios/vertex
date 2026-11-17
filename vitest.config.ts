import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Pure-logic tests only (parsers, link graph, plugin resolution); no Nuxt runtime.
export default defineConfig({
    resolve: {
        alias: {
            '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
            '~': fileURLToPath(new URL('./app', import.meta.url)),
            '#layers': fileURLToPath(new URL('./layers', import.meta.url)),
        },
    },
    test: {
        include: ['{app,shared}/**/*.test.ts', 'layers/*/{app,shared}/**/*.test.ts', 'packages/*/src/**/*.test.ts'],
        passWithNoTests: true,
    },
})
