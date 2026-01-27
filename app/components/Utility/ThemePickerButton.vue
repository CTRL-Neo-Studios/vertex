<script setup lang="ts">
import type {ButtonProps} from "@nuxt/ui";

const props = withDefaults(defineProps<{
    label: string
    icon?: string
    chip?: string
    selected?: boolean,
    variant?: ButtonProps['variant'],
    color?: ButtonProps['color']
}>(), {
    variant: 'outline',
    color: 'neutral'
})

const slots = defineSlots<{
    leading: () => any
}>()

const colorMode = useColorMode()

// Use lighter shade in dark mode for better visibility
const chipColor = computed(() => {
    if (!props.chip) return ''
    const shade = colorMode.value === 'dark' ? '400' : '500'
    return `var(--color-${props.chip}-${shade})`
})
</script>

<template>
    <UButton
        size="sm"
        :color="color"
        :variant="variant"
        :icon="icon"
        :label="label"
        class="capitalize ring-default rounded-sm text-[11px]"
    >
        <template v-if="chip || !!slots.leading" #leading>
            <slot name="leading">
                <span
                    class="inline-block size-2 rounded-full"
                    :class="`bg-(--color-light) dark:bg-(--color-dark)`"
                    :style="{
                        '--color-light': `var(--color-${chip}-500)`,
                        '--color-dark': `var(--color-${chip}-400)`
                    }"
                />
            </slot>
        </template>
    </UButton>
</template>