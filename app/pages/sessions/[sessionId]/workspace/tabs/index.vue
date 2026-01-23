<script setup lang="ts">

import TabsHeaderComponent from "~/components/TabsHeaderComponent.vue";
import DashboardLeftPanelSidebar from "~/components/LayoutComponents/DashboardLeftPanelSidebar.vue";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import DashboardRightPanelSidebar from "~/components/LayoutComponents/DashboardRightPanelSidebar.vue";

definePageMeta({
    layout: 'workspace'
})

const $route = useRoute()
</script>

<template>
    <div class="w-full h-full flex flex-col items-center justify-center">
        <div class="text-muted">Select a file from left side.</div>
    </div>
</template>

<style>
@reference "~/assets/css/main.css";


</style>