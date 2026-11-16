<script setup lang="ts">
/** Asks to restart Vertex so a plugin turned off stops: until then it runs on (its windows keep what it was granted). */
const props = defineProps<{ name: string }>()
const emit = defineEmits<{ close: [boolean] }>()
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="$t('app.settings.plugins.restart.title', {name: props.name})"
        :description="$t('app.settings.plugins.restart.description')"
        size="sm"
    >
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="outline" :label="$t('app.settings.plugins.restart.later')" @click="() => emit('close', false)"/>
                <UButton size="sm" :label="$t('app.settings.plugins.restart.now')" data-restart-now @click="() => emit('close', true)"/>
            </div>
        </template>
    </UModal>
</template>
