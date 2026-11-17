<script setup lang="ts">
/** Asks before removing a community plugin: its files go, its settings and data stay. */
const props = defineProps<{ name: string }>()
const emit = defineEmits<{ close: [boolean] }>()
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="$t('app.settings.plugins.removeModal.title', {name: props.name})"
        :description="$t('app.settings.plugins.removeModal.description')"
        size="sm"
    >
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="outline" :label="$t('app.settings.plugins.installModal.cancel')" @click="() => emit('close', false)"/>
                <UButton size="sm" color="error" :label="$t('app.settings.plugins.remove')" data-plugin-remove-confirm @click="() => emit('close', true)"/>
            </div>
        </template>
    </UModal>
</template>
