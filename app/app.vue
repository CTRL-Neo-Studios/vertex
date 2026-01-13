<script setup lang="ts">
</script>

<template>
    <UApp>
        <NuxtLayout>
            <NuxtPage/>
        </NuxtLayout>
    </UApp>
</template>

<style>
@reference "~/assets/css/main.css";

div[data-tauri-decorum-tb] {
    pointer-events: none;
    div[data-tauri-drag-region] {
        pointer-events: none;
    }
}
</style>