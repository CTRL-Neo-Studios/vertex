<script setup lang="ts">
import {platform} from "@tauri-apps/plugin-os";

const props = withDefaults(defineProps<{
    detectOs: string,
    showOnOs: boolean,
    class?: string
}>(), {
    class: 'w-24'
})

const $platform = platform()
</script>

<template>
    <div class="w-fit" v-if="!props.showOnOs">
        <div :class="props.class" v-if="$platform != props.detectOs"/>
    </div>
    <div class="w-fit" v-else>
        <div :class="props.class" v-if="$platform == props.detectOs"/>
    </div>
</template>

<style scoped>

</style>