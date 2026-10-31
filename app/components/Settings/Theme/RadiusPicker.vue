<script setup lang="ts">
import {RADIUSES, useAppTheme} from "~/composables/app/useAppTheme";

/** Radius stops as buttons, each drawn with its own corner so the choice is visible before it is made. */
const {theme, update} = useAppTheme()
</script>

<template>
    <div class="flex gap-1">
        <UTooltip v-for="r in RADIUSES" :key="r" :text="`${r}rem`">
            <UButton
                size="sm"
                color="neutral"
                variant="outline"
                square
                :active="theme.roundedRadius === r"
                active-color="primary"
                active-variant="subtle"
                :aria-label="`${r}rem`"
                @click="update({ roundedRadius: r })"
            >
                <!-- The top-left corner of a 1rem box at that radius. -->
                <span class="block size-4 border-t-2 border-s-2 border-current" :style="{ borderTopLeftRadius: `${r}rem` }"/>
            </UButton>
        </UTooltip>
    </div>
</template>
