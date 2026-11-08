<script setup lang="ts">
import {workspaceBadge} from "~/utils/workspaceBadge";

/** A workspace's initials on its colour (see `workspaceBadge`). */
const props = defineProps<{ path: string, size?: 'sm' | 'md' }>()
const badge = computed(() => workspaceBadge(props.path))
</script>

<template>
    <span
        :class="['inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white select-none', size === 'md' ? 'size-7 text-xs' : 'size-5 text-[10px]']"
        :style="{ background: `oklch(0.6 0.12 ${badge.hue})` }"
        aria-hidden="true"
    >{{ badge.initials }}</span>
</template>
