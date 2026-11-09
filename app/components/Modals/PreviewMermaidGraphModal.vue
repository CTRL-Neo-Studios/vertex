<script setup lang="ts">
import MermaidDiagram from "~/components/Utility/MermaidDiagram.vue";

const props = defineProps<{
    codeContent?: string
}>()
const emit = defineEmits<{ close: [boolean] }>()

</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="$t('app.editor.ui.previewMermaid')"
        fullscreen
        :ui="{body: 'p-0 m-0'}"
    >
        <template #body>
            <MermaidDiagram class="h-full" :source="props?.codeContent || ''" :options="{ zoom: true }"/>
        </template>
    </UModal>
</template>