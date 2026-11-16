<script setup lang="ts">
import type {PanelViewProps} from "#shared/plugin/api";

/** The Files view: the workspace's file tree, with New note/folder/each file type on right-click and in its header. */
const props = defineProps<PanelViewProps>()

// Like Chats' New chat and New folder: the first two New items.
watchEffect(() => {
    const [note, folder] = props.session.files.newItems()
    props.actions([note!, folder!].map((item, i) => ({id: i ? 'newFolder' : 'newNote', label: item.label, icon: item.icon!, onSelect: item.onSelect!})))
})
</script>

<template>
    <FilesTree :session="session"/>
</template>
