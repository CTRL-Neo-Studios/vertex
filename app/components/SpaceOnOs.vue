<script setup lang="ts">
import {useOsPlatform} from "~/composables/utility/useOsPlatform";

const props = defineProps<{
    detectOs: string,
    showOnOs: boolean
}>()

const $platform = useOsPlatform()
</script>

<template>
    <div class="w-fit" v-if="props.showOnOs">
        <div class="w-24" v-if="$platform != props.detectOs"/>
    </div>
    <div class="w-fit" v-else>
        <div class="w-24" v-if="$platform == props.detectOs"/>
    </div>
</template>

<style scoped>

</style>