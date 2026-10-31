// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
    {
        ignores: ['src-tauri/**', '.output/**', '.data/**'],
    },
    {
        // Pure formatting rules the codebase never followed; correctness rules stay on.
        rules: {
            'vue/attributes-order': 'off',
            'vue/attribute-hyphenation': 'off',
            'vue/v-on-event-hyphenation': 'off',
            'vue/html-self-closing': 'off',
        },
    },
)
