<script setup lang="ts">
import colors from 'tailwindcss/colors'
import {NEUTRAL_COLORS, PRIMARY_COLORS, useAppTheme} from "~/composables/app/useAppTheme";

/** A palette picker: a swatch-labelled trigger opening the palette grid (after Nuxt UI's ThemeStudioColorMenu). */
const props = defineProps<{ alias: 'primary' | 'neutral' }>()

const {theme, update} = useAppTheme()
const appConfig = useAppConfig()

const isBlack = computed(() => props.alias === 'primary' && theme.value.blackAsPrimary)
const value = computed(() => props.alias === 'primary' ? theme.value.primaryColor : theme.value.neutralColor)
const options = computed(() => props.alias === 'primary' ? PRIMARY_COLORS : NEUTRAL_COLORS)

// A 400→600 strip says more about a palette than one dot. Read from tailwind's JS values: Tailwind only
// emits `--color-*` variables for palettes the CSS uses, so most of these have no variable to point at.
function ramp(color: string) {
    const shades = (colors as unknown as Record<string, Record<number, string>>)[color]
    return shades ? `linear-gradient(to right, ${shades[400]}, ${shades[500]}, ${shades[600]})` : undefined
}

function pick(color: string) {
    return update(props.alias === 'primary' ? {primaryColor: color, blackAsPrimary: false} : {neutralColor: color})
}
</script>

<template>
    <UPopover :content="{ align: 'end' }" :ui="{ content: 'p-2 grid grid-cols-3 gap-1 w-80' }">
        <UButton
            color="neutral"
            variant="outline"
            class="w-52 capitalize group"
            :label="isBlack ? $t('app.generic.black') : value"
            :trailing-icon="appConfig.ui.icons.chevronDown"
            :ui="{ label: 'flex-1 text-left truncate', trailingIcon: 'text-dimmed transition-transform duration-200 group-data-[state=open]:rotate-180' }"
        >
            <template #leading>
                <span
                    class="inline-block h-2 w-3 shrink-0 rounded-full"
                    :class="isBlack && 'bg-black dark:bg-white'"
                    :style="isBlack ? undefined : { background: ramp(value) }"
                />
            </template>
        </UButton>

        <template #content>
            <UButton
                v-if="alias === 'primary'"
                :label="$t('app.generic.black')"
                size="sm"
                color="neutral"
                variant="subtle"
                class="justify-start"
                :active="isBlack"
                active-color="primary"
                active-variant="subtle"
                @click="update({ blackAsPrimary: true })"
            >
                <template #leading>
                    <span class="inline-block h-2 w-3 shrink-0 rounded-full bg-black dark:bg-white"/>
                </template>
            </UButton>
            <UButton
                v-for="color in options"
                :key="color"
                :label="color"
                size="sm"
                color="neutral"
                variant="subtle"
                class="capitalize justify-start"
                :active="!isBlack && value === color"
                active-color="primary"
                active-variant="subtle"
                @click="pick(color)"
            >
                <template #leading>
                    <span class="inline-block h-2 w-3 shrink-0 rounded-full" :style="{ background: ramp(color) }"/>
                </template>
            </UButton>
        </template>
    </UPopover>
</template>
