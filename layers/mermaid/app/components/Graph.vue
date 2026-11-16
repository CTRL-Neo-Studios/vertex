<script setup lang="ts">
import PreviewModal from "./PreviewModal.vue";
import Diagram from "./Diagram.vue";

// The editor's block props come with `host` (`CodeBlockDef`), which this doesn't need: not an attribute.
defineOptions({inheritAttrs: false})
const props = defineProps<{ codeContent?: string }>()
const {t} = useI18n()
const toast = useToast()
const $clip = useClipboard()
const $ovl = useOverlay()
const previewGraphModal = $ovl.create(PreviewModal)

async function copyToClipboard() {
    if (props?.codeContent) {
        await $clip.copy(props.codeContent)
        toast.add({title: t('plugins.mermaid.copied'), color: 'info', icon: 'lucide:info'})
    }
}

function openPreview() {
    if (props?.codeContent)
        previewGraphModal.open({
            codeContent: props.codeContent
        })
}
</script>

<template>
    <div class="p-3 rounded-lg border border-default bg-submuted flex flex-col items-center justify-center relative group">
        <div class="flex items-center justify-center absolute top-2 right-2 gap-1.5 z-10 group-hover:opacity-100 opacity-0 transition">
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-eye" class="text-dimmed" @click="openPreview"/>
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-clipboard" class="text-dimmed" @click="copyToClipboard"/>
        </div>
        <Diagram :source="codeContent || ''" :options="{ zoom: false }"/>
    </div>
</template>
