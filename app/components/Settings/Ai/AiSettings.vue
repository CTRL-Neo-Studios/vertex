<script setup lang="ts">
import type {SettingsPageProps} from "#shared/plugin/api";
import {Routes} from "#shared/constants/app";

/** Settings → Assistive AI: Providers, Models (lists, and a page per item) and Features, by the route below `/settings/ai`. */
const props = defineProps<SettingsPageProps>()

// `/settings/ai` itself opens Providers.
watch(() => props.path.length, length => {
    if (!length) void navigateTo(`${Routes.settings}/ai/providers`, {replace: true})
}, {immediate: true})
</script>

<template>
    <SettingsAiProvider v-if="path[0] === 'providers' && path[1]" :id="path[1]"/>
    <SettingsAiProviders v-else-if="path[0] === 'providers'"/>
    <SettingsAiModel v-else-if="path[0] === 'models' && path[1]" :id="path[1]"/>
    <SettingsAiModels v-else-if="path[0] === 'models'"/>
    <SettingsAiFeatures v-else-if="path[0] === 'features'"/>
</template>
