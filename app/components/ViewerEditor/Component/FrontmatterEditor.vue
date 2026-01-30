<script setup lang="ts">
import type { AccordionItem } from "@nuxt/ui";
import type {YamlFormData} from '@type32/yaml-editor-form'
import DataEditorForm from "~/components/ViewerEditor/Component/DataEditorForm.vue";

const editorInstance = defineModel('editorInstance', {required: true})
const open = defineModel('open', {required: true, default: false})
const $ef = useEditorFrontmatter<YamlFormData>(editorInstance)

const formData = ref<YamlFormData>({})
const formError = ref()

onMounted(async () => {
    await until(editorInstance).toMatch(v => v != null)
})

watch(open, (newValue) => {
    if (newValue) {
        const {data, error} = $ef.getFrontmatter()
        formError.value = error
        if (!unref(formError))
            formData.value = data || {}
    } else {
        if (!unref(formError)) {
            $ef.setFrontmatterProperties(unref(formData))
        } else {
            console.error(unref(formError))
        }
    }
}, {deep: true})

watchDebounced(formData, (newValue) => {
    if (!unref(open) || unref(formError)) return;
    $ef.setFrontmatterProperties(newValue)
}, {deep: true, debounce: 100, maxWait: 200})

</script>

<template>
    <UModal v-model:open="open" :default-open="false">
        <UButton variant="link" icon="i-lucide-file-braces-corner" size="sm" color="neutral" block class="justify-center" label="Frontmatter"/>
        <template #content>
            <UScrollArea class="w-full max-h-96 rounded-lg p-3">
                <template v-if="!formError">
                    <DataEditorForm v-model="formData" size="xs" class="w-full space-y-0 flex flex-col gap-4"/>
                </template>
                <slot v-else name="error" :error="formError">
                    <UEmpty
                        variant="naked"
                        icon="i-lucide-circle-x"
                        title="Cannot parse frontmatter"
                        description="There must be something wrong with your frontmatter; to prevent further corruption of your content, the editor form will hidden."
                    />
                </slot>
            </UScrollArea>
        </template>
    </UModal>
</template>

<style scoped>

</style>