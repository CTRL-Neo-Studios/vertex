<script setup lang="ts">
import {settingsPages} from "~/utils/contributions";
import {contributionPlugin} from "~/utils/plugins/runtime";

definePageMeta({
    layout: 'settings'
})

/**
 * A registered settings page (`settingsPages`), at `/settings/<id>/…`: its plugin's one page (`SettingsPluginPage`),
 * with the route below its id as `path`. The kernel's own pages are file routes, which the router ranks before this one.
 */
const $route = useRoute()
const segments = computed(() => [$route.params.path ?? []].flat())
const page = computed(() => settingsPages.get(segments.value[0]))
const plugin = computed(() => page.value && contributionPlugin(page.value))
</script>

<template>
    <SettingsPluginPage v-if="page && plugin" :plugin :page :path="segments.slice(1)"/>
</template>
