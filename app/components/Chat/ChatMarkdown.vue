<script setup lang="ts">
import type {ComarkPlugin, Node} from "comark";
import {visit} from "@comark/nuxt/utils";
import ChatLink from "~/components/Chat/ChatLink.vue";
import ChatCodeBlock from "~/components/Chat/ChatCodeBlock.vue";

defineProps<{ value: string, streaming?: boolean }>()

/** Comark parses `[[X]]` as a span in a span; returns `X` for that shape. Code never gets there: its text isn't parsed. */
function wikiText(n: Node): string | undefined {
    if (!Array.isArray(n) || n[0] !== 'span' || n.length !== 3) return
    const inner = n[2]
    return Array.isArray(inner) && inner[0] === 'span' && inner.length === 3 && typeof inner[2] === 'string' ? inner[2] : undefined
}

/** `[[Target]]` / `[[Target|Alias]]` → a ChatLink to the note. */
const wikiLinks: ComarkPlugin = {
    name: 'wikilinks',
    post(state) {
        visit(state.tree, n => wikiText(n) !== undefined, n => {
            const [note = '', alias] = (wikiText(n) ?? '').split('|')
            return ['a', {note: note.trim()}, (alias ?? note).trim()]
        })
    },
}
const plugins = [wikiLinks]
// Everything else renders through Nuxt UI's prose components (@comark/nuxt turns them on).
const components = {a: ChatLink, pre: ChatCodeBlock}
</script>

<template>
    <Suspense>
        <Markdown :value :streaming :plugins :components class="*:first:mt-0 *:last:mb-0"/>
    </Suspense>
</template>
