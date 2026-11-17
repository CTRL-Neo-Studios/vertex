<script setup lang="ts">
/** Asks for the URL of a community plugin's `.zip`. */
const emit = defineEmits<{ close: [string | false] }>()
const {t} = useI18n()
const url = ref('')
const valid = computed(() => /^https?:\/\/\S+$/.test(url.value.trim()))
const submit = () => valid.value && emit('close', url.value.trim())
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="t('app.settings.plugins.urlModal.title')"
        :description="t('app.settings.plugins.urlModal.description')"
        size="sm"
    >
        <template #body>
            <UInput v-model="url" class="w-full" autofocus :placeholder="t('app.settings.plugins.urlModal.placeholder')" data-plugin-url @keydown.enter="submit"/>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="outline" :label="t('app.settings.plugins.installModal.cancel')" @click="() => emit('close', false)"/>
                <UButton size="sm" :disabled="!valid" :label="t('app.settings.plugins.urlModal.next')" @click="submit"/>
            </div>
        </template>
    </UModal>
</template>
