<script setup lang="ts">
import type {SettingsPageProps} from "#shared/plugin/api";

/** Settings → AI: Providers, Models (lists, and a page per item) and Features, by the route below `/settings/ai`. */
const props = defineProps<SettingsPageProps>()

// `/settings/ai` itself opens Providers.
watch(() => props.path.length, length => {
    if (!length) void navigateTo('/settings/ai/providers', {replace: true})
}, {immediate: true})
</script>

<template>
    <AiProvider v-if="path[0] === 'providers' && path[1]" :id="path[1]"/>
    <AiProviders v-else-if="path[0] === 'providers'"/>
    <AiModel v-else-if="path[0] === 'models' && path[1]" :id="path[1]"/>
    <AiModels v-else-if="path[0] === 'models'"/>
    <AiFeatures v-else-if="path[0] === 'features'" :config/>
</template>
