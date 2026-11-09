import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Pure-logic tests only (parsers, link graph); no Nuxt runtime.
export default defineConfig({
    resolve: {
        alias: {
            '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
            '~': fileURLToPath(new URL('./app', import.meta.url)),
        },
    },
    test: {
        include: ['{app,shared}/**/*.test.ts'],
        passWithNoTests: true,
    },
})
