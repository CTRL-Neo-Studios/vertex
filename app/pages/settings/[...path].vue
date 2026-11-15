<script setup lang="ts">
import {settingsPages} from "~/utils/contributions";

definePageMeta({
    layout: 'settings'
})

/**
 * A registered settings page (`settingsPages`), at `/settings/<id>/…`; it gets the route below its id as `path`. The
 * kernel's own pages are file routes, which the router ranks before this one.
 */
const $route = useRoute()
const segments = computed(() => [$route.params.path ?? []].flat())
const page = computed(() => settingsPages.get(segments.value[0]))
</script>

<template>
    <PluginMount v-if="page" :key="page.id" :ui="page" :props="{path: segments.slice(1)}"/>
</template>
