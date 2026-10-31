<script setup lang="ts">
import FileTreeComponent from "#build/types/components";
const props = defineProps<{
    modalTitle?: string,
    atFileIndexId: string,
    asFolder: boolean,
    isFolder: boolean,
    asLevel: "above" | "same" | "below",
    fileExt?: string,
}>()
const emit = defineEmits<{ close: [boolean] }>()

const selectedFolder = ref<string>('')
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="props?.modalTitle ?? $t('app.editor.ui.moveFileTo')"
        size="sm"
    >
        <template #body>
            <FileTreeComponent v-model="selectedFolder" only-folders no-context-menu class="w-full h-full" />
        </template>
    </UModal>
</template>

<style scoped>

</style>