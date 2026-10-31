<script setup lang="ts">
// Keyed by tab so switching tabs remounts the editor with fresh state.
definePageMeta({
    layout: 'session'
})
</script>

<template>
    <SessionTab :key="$route.params.tabId as string"/>
</template>
