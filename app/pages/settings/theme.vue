<script setup lang="ts">
import {useAppTheme} from "~/composables/app/useAppTheme";
import {useAppSettings} from "~/composables/app/useAppSettings";

definePageMeta({
    layout: 'settings'
})

const saving = ref(false)

</script>

<template>
    <SettingsScrollLayout title="Theme">
        <template #header-trailing>
            <UTooltip text="Saving...">
                <UIcon class="text-dimmed animate-spin" v-if="saving" name="i-lucide-loader-circle"/>
            </UTooltip>
        </template>
        <UtilityThemePicker v-model:saving="saving"/>
    </SettingsScrollLayout>
</template>

<style scoped>

</style>