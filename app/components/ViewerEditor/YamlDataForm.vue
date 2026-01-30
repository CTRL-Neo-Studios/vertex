<script setup lang="ts">
import type {YamlFormData} from "@type32/yaml-editor-form";

const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
const contentSaved = defineModel<boolean>('contentSaved', {default: false})

const props = withDefaults(defineProps<{
    renaming: boolean,
    filePath?: string,
    disabled?: boolean
}>(), {
    renaming: false,
    filePath: '',
    disabled: false
})

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
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
    <ViewerEditorLayoutWrapper
        scrollMode="vertical"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
    >
        <template #default>
            <ViewerEditorComponentDataEditorForm
                v-model="payloadData"
                size="sm"
                class="h-full max-w-2xl w-full"
                :disabled="payloadError != undefined || renaming"
            />
        </template>
        <template #status-bar>
            <ViewerEditorComponentWordCounter v-model="content"/>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>