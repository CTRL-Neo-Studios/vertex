<script setup lang="ts">
import {platform} from "@tauri-apps/plugin-os";

const $platform = platform()

const css = computed<string>(() => $platform == 'macos' ? 'w-16' : 'w-24')

const props = withDefaults(defineProps<{
    detectOs: string,
    showOnOs: boolean,
    class?: string
}>(), {
    class: ''
})
</script>

<template>
    <div class="w-fit" v-if="!props.showOnOs">
        <div :class="(props.class == undefined || props.class == '') ? css : props.class" v-if="$platform != props.detectOs"/>
    </div>
    <div class="w-fit" v-else>
        <div :class="(props.class == undefined || props.class == '') ? css : props.class" v-if="$platform == props.detectOs"/>
    </div>
</template>

<style scoped>

</style>
