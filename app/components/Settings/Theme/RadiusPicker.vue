<script setup lang="ts">
import {RADIUSES, useAppTheme} from "~/composables/app/useAppTheme";

/** Radius stops as buttons, each drawn with its own corner so the choice is visible before it is made. */
const {theme, update} = useAppTheme()
</script>

<template>
    <UToggleGroup
        :items="RADIUSES.map(r => ({ value: r, square: true, 'aria-label': `${r}rem` }))"
        :model-value="theme.roundedRadius"
        size="sm"
        variant="outline"
        active-variant="subtle"
        @update:model-value="v => RADIUSES.includes(v as never) && update({ roundedRadius: v as number })"
    >
        <template #default="{ item }">
            <UTooltip :text="`${item.value}rem`">
                <!-- The top-left corner of a 1rem box at that radius. -->
                <span class="block size-4 border-t-2 border-s-2 border-current" :style="{ borderTopLeftRadius: `${item.value}rem` }"/>
            </UTooltip>
        </template>
    </UToggleGroup>
</template>
