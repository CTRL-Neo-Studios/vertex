<script setup lang="ts">
import type {SessionContext} from "#shared/plugin/api";
import {ViewerLayout} from "~/plugin/ui";

/** A `.base` file in its tab (`Base.vue`); the tab autosaves the text its edits produce. */
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({default: ''})
defineModel<boolean>('contentSaved', {default: false})
const props = withDefaults(defineProps<{
    renaming: boolean,
    filePath?: string,
    session: SessionContext,
    disabled?: boolean,
}>(), {filePath: '', disabled: false})
const emit = defineEmits<{ rename: [oldValue: string, newValue: string] }>()
</script>

<template>
    <ViewerLayout
        scrollMode="none"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
        :showStatusBar="false"
        :bottomSpacing="false"
    >
        <BasesBase v-model="content" :session="props.session" :this-path="filePath"/>
    </ViewerLayout>
</template>
