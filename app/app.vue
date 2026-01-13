<script setup lang="ts">
const appCfg = useAppConfig()
</script>

<template>
    <UApp>
<!--        <NuxtLoadingIndicator :color="appCfg.ui.colors.primary"/>-->
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

.page-enter-active,
.page-leave-active {
    transition: all 0.15s;
}
.page-enter-from,
.page-leave-to {
    opacity: 0;
    filter: blur(1rem);
}
</style>