<script setup lang="ts">
/**
 * One settings group: a header (with a reset button while the group differs from its defaults) over a
 * stack of `SettingsRow`s. Modelled on Nuxt UI's theme studio sections.
 */
defineProps<{
    title: string
    description?: string
    /** Shows the reset button; the caller decides what "dirty" means. */
    dirty?: boolean
}>()

defineEmits<{ reset: [] }>()
</script>

<template>
    <section class="rounded-lg ring ring-default bg-default">
        <header class="flex items-center gap-2 px-4 pt-3 pb-1">
            <div class="flex-1 min-w-0">
                <h2 class="text-sm font-semibold text-highlighted">{{ title }}</h2>
                <p v-if="description" class="text-xs text-muted">{{ description }}</p>
            </div>
            <UTooltip v-if="dirty" :text="$t('app.settings.resetSection')">
                <UButton
                    icon="i-lucide-rotate-ccw"
                    size="xs"
                    color="primary"
                    variant="ghost"
                    :aria-label="$t('app.settings.resetSection')"
                    @click="$emit('reset')"
                />
            </UTooltip>
            <slot name="actions"/>
        </header>
        <div class="divide-y divide-default">
            <slot/>
        </div>
    </section>
</template>
