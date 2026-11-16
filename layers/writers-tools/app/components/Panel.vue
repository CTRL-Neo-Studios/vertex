<script setup lang="ts">
import type {PanelViewProps} from "#shared/plugin/api";

defineProps<PanelViewProps>()
</script>

<template>
    <div class="w-full h-full">
        <div v-if="session.tabs.active()" class="w-full grid grid-cols-1">
            <UButton :label="$t('plugins.writers-tools.analyzeText')" block/>
        </div>
    </div>
</template>
