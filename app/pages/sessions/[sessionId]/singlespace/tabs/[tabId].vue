<script setup lang="ts">
definePageMeta({
    layout: 'session'
})
</script>

<template>
    <!-- Keyed by tab so switching tabs remounts the editor with fresh state. -->
    <SessionTab :key="$route.params.tabId as string"/>
</template>
