<script setup lang="ts">
definePageMeta({
    layout: 'settings'
})

const saving = ref(false)

</script>

<template>
    <SettingsScrollLayout :title="$t('app.settings.theme.title')">
        <template #header-trailing>
            <UTooltip :text="$t('app.settings.saving')">
                <UIcon class="text-dimmed animate-spin" v-if="saving" name="i-lucide-loader-circle"/>
            </UTooltip>
        </template>
        <UtilityThemePicker v-model:saving="saving"/>
    </SettingsScrollLayout>
</template>

<style scoped>

</style>