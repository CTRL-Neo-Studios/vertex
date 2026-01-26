<script setup lang="ts">
import VueMermaidString from "vue-mermaid-string";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import PreviewMermaidGraphModal from "~/components/Modals/PreviewMermaidGraphModal.vue";

const props = defineProps<{ codeContent?: string }>()
const $qt = useQuickToasts()
const $clip = useClipboard()
const $ovl = useOverlay()
const previewGraphModal = $ovl.create(PreviewMermaidGraphModal)

async function copyToClipboard() {
    if (props?.codeContent) {
        await $clip.copy(props.codeContent)
        $qt.info('Copied mermaid diagram code.')
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
        <VueMermaidString :value="codeContent || ''"/>
    </div>
</template>

<style scoped>
@reference "~/assets/css/main.css";
div[data-processed=true] {
    @apply w-fit
}
</style>