<script setup lang="ts">
import type {YamlFormData} from "@type32/yaml-editor-form";
import {ViewerLayout} from "~/plugin/ui";
import Fields from "./Fields.vue";

const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
defineModel<boolean>('contentSaved', {default: false})

withDefaults(defineProps<{
    renaming: boolean,
    filePath?: string,
    disabled?: boolean
}>(), {
    renaming: false,
    filePath: '',
    disabled: false
})

const emit = defineEmits<{
    (e: 'rename', oldValue: string, newValue: string): void
}>()

const payload = computed(() => parseYaml<YamlFormData>(unref(content)))
const payloadError = computed(() => unref(payload).error)
const payloadData = computed({
    get() {
        if (unref(payloadError)) return {}
        return unref(payload).data || {}
    },
    set(newValue) {
        const p = stringifyYaml(newValue)
        if (!p.error)
            content.value = p.yaml || ''
    }
})
</script>

<template>
    <ViewerLayout
        scrollMode="vertical"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
    >
        <template #default>
            <Fields
                v-model="payloadData"
                size="sm"
                class="h-full max-w-2xl w-full"
                :disabled="payloadError != undefined || renaming"
            />
        </template>
    </ViewerLayout>
</template>
