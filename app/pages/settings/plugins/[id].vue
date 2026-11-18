<script setup lang="ts">
import {Routes} from "#shared/constants/app";
import {settingsPages} from "~/utils/contributions";
import {contributionPlugin} from "~/utils/plugins/runtime";

definePageMeta({
    layout: 'settings'
})

/**
 * `/settings/plugins/<id>`: a plugin's settings from its manifest alone (`SettingsPluginPage`). A plugin that
 * registered a page has its one page there instead, `/settings/<page id>`, which draws its schema too: this goes to it.
 */
const route = useRoute()
const id = computed(() => String(route.params.id))
const page = computed(() => [...settingsPages.items.values()].find(def => contributionPlugin(def) === id.value))
watch(page, def => {
    if (def) void navigateTo(`${Routes.settings}/${def.id}`, {replace: true})
}, {immediate: true})
</script>

<template>
    <SettingsPluginPage v-if="!page" :plugin="id" :path="[]"/>
</template>
