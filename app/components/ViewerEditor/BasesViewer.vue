<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";

/** A `.base` file in its tab (`Bases/Base.vue`); the tab autosaves the text its edits produce. */
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({default: ''})
defineModel<boolean>('contentSaved', {default: false})
const props = withDefaults(defineProps<{
    renaming: boolean,
    filePath?: string,
    sessionId: string,
    disabled?: boolean,
}>(), {filePath: '', disabled: false})
const emit = defineEmits<{ rename: [oldValue: string, newValue: string] }>()

const session = useActiveSessions().getSession(props.sessionId)!
</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="none"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
        :showStatusBar="false"
        :bottomSpacing="false"
    >
        <ViewerEditorBasesBase v-model="content" :session="session" :this-path="filePath"/>
    </ViewerEditorLayoutWrapper>
</template>
