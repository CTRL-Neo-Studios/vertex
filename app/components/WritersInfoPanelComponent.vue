<script setup lang="ts">
import {computed} from "vue";

const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string), $tabId = computed<string>(() => $route.params.tabId as string)
</script>

<template>
    <div class="w-full h-full">
        <template v-if="$tabId && $sessionId">
            <div class="w-full grid grid-cols-1">
                <UButton :label="$t('app.editor.ui.analyzeText')" block/>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>