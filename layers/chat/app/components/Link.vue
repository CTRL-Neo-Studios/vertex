<script setup lang="ts">
import {openExternal} from "~/plugin/ui";
import {chatSession} from "../plugin";

/**
 * A link in a chat. `note` (a `[[wikilink]]` target or a note's relative path) opens the note in a tab; `href`
 * opens in the browser, since following an <a> would navigate the Tauri window away from the app.
 */
const props = defineProps<{ href?: string, note?: string }>()

const session = chatSession()!

// Resolves like a note's links (the link graph): base name, relative path without extension, or relative path.
const file = computed(() => {
    const key = props.note?.split('#')[0]?.trim()
    return key ? session.index.resolveLink(key) : undefined
})

async function onClick() {
    if (props.note !== undefined) {
        if (file.value) await session.tabs.open(file.value.uuid)
    } else if (props.href) {
        await openExternal(props.href)
    }
}
</script>

<template>
    <a
        :href="href ?? '#'"
        :class="note !== undefined && !file ? 'text-muted line-through decoration-dotted' : 'text-primary hover:underline cursor-pointer'"
        @click.prevent="onClick"
    ><slot/></a>
</template>
