<script setup lang="ts">
import Diagram from "./Diagram.vue";

const props = defineProps<{
    codeContent?: string
}>()
const emit = defineEmits<{ close: [boolean] }>()

</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="$t('plugins.mermaid.preview')"
        fullscreen
        :ui="{body: 'p-0 m-0'}"
    >
        <template #body>
            <Diagram class="h-full" :source="props?.codeContent || ''" :options="{ zoom: true }"/>
        </template>
    </UModal>
</template>
