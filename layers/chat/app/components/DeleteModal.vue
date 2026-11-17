<script setup lang="ts">
/** Confirms deleting a chat or a folder; closes with `true` to delete. */
defineProps<{ modalTitle: string, description: string }>()
const emit = defineEmits<{ close: [boolean] }>()
</script>

<template>
    <UModal :close="{ onClick: () => emit('close', false) }" :title="modalTitle" :description size="sm">
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" :label="$t('app.generic.cancel')" @click="emit('close', false)"/>
                <UButton size="sm" color="error" :label="$t('app.generic.delete')" @click="emit('close', true)"/>
            </div>
        </template>
    </UModal>
</template>
