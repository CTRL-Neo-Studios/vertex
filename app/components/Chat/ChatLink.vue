<script setup lang="ts">
import {linkKeys} from "#shared/utils/index/linkGraph";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";

/**
 * A link in a chat. `note` (a `[[wikilink]]` target or a note's relative path) opens the note in a tab; `href`
 * opens in the browser, since following an <a> would navigate the Tauri window away from the app.
 */
const props = defineProps<{ href?: string, note?: string }>()

const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {getFilteredFiles} = useActiveWorkspaceIndex(session)
const {openTab} = useActiveTabs(session)
const $navi = useAppNavigator()
const {openUrlInBrowser} = useAppOpener()

// Resolves like the link graph: base name, relative path without extension, or relative path.
const file = computed(() => {
    const key = props.note?.split('#')[0]?.trim()
    return key ? getFilteredFiles(f => !f.isFolder && linkKeys(f.relativePath).includes(key))[0] : undefined
})

async function onClick() {
    if (props.note !== undefined) {
        if (file.value) await $navi.toWorkspaceTab(session?.uuid, openTab(file.value.uuid))
    } else if (props.href && /^(https?:|mailto:)/.test(props.href)) {
        await openUrlInBrowser(props.href)
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
