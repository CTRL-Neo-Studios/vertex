<script setup lang="ts">
import {Markdown, type ComarkPlugin, type Node} from "@comark/vue";
import {visit} from "@comark/vue/utils";
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
const components = {a: ChatLink, pre: ChatCodeBlock}
</script>

<template>
    <div class="chat-markdown">
        <Suspense>
            <Markdown :value :streaming :plugins :components/>
        </Suspense>
    </div>
</template>

<style>
/* No typography plugin in this app: a small prose set on Nuxt UI's tokens. Unscoped, flat: the content is Comark's. */
.chat-markdown { line-height: 1.65; overflow-wrap: anywhere; }
.chat-markdown .comark-content > :first-child { margin-top: 0; }
.chat-markdown .comark-content > :last-child { margin-bottom: 0; }
.chat-markdown :is(p, ul, ol, blockquote, pre, table) { margin: 0.6em 0; }
.chat-markdown :is(h1, h2, h3, h4, h5, h6) { margin: 1em 0 0.4em; font-weight: 600; color: var(--ui-text-highlighted); }
.chat-markdown h1 { font-size: 1.35em; }
.chat-markdown h2 { font-size: 1.2em; }
.chat-markdown h3 { font-size: 1.1em; }
.chat-markdown ul { list-style: disc; padding-left: 1.4em; }
.chat-markdown ol { list-style: decimal; padding-left: 1.4em; }
.chat-markdown li + li { margin-top: 0.2em; }
.chat-markdown strong { font-weight: 600; color: var(--ui-text-highlighted); }
.chat-markdown blockquote { border-left: 3px solid var(--ui-border-accented); padding-left: 0.8em; color: var(--ui-text-muted); }
.chat-markdown hr { border-color: var(--ui-border); margin: 1em 0; }
.chat-markdown code { font-family: var(--font-mono); font-size: 0.9em; background: var(--ui-bg-muted); border-radius: 0.25rem; padding: 0.1em 0.3em; }
.chat-markdown pre { background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 0.5rem; padding: 0.75em 1em; overflow-x: auto; }
.chat-markdown pre code { background: none; padding: 0; font-size: 0.85em; }
.chat-markdown table { border-collapse: collapse; display: block; overflow-x: auto; }
.chat-markdown :is(th, td) { border: 1px solid var(--ui-border); padding: 0.3em 0.6em; }
.chat-markdown th { background: var(--ui-bg-muted); font-weight: 600; }
</style>
