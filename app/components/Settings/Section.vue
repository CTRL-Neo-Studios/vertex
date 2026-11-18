<script setup lang="ts">
import type {SettingsSectionEmits, SettingsSectionProps} from "#shared/plugin/components";

/**
 * One settings group: a header (with a reset button while the group differs from its defaults) over a stack of
 * `SettingsRow`s, and nothing else: a row is what pads. Its description is one line, as a row's; `info` holds what
 * takes more, `empty` what to say while there are no rows. Published to plugins.
 */
defineProps<SettingsSectionProps>()

defineEmits<SettingsSectionEmits>()
</script>

<template>
    <section class="rounded-lg ring ring-default bg-default">
        <header class="flex items-center gap-2 px-4 pt-3 pb-1">
            <div class="flex-1 min-w-0">
                <h2 class="text-sm font-semibold text-highlighted flex items-center gap-1.5">
                    <span class="truncate">{{ title }}</span>
                    <SettingsInfo v-if="info" :text="info"/>
                </h2>
                <p v-if="description" class="text-xs text-muted truncate" :title="description">{{ description }}</p>
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
            <p v-if="empty" class="px-4 py-2.5 text-sm text-muted" data-settings-empty>{{ empty }}</p>
            <slot/>
        </div>
    </section>
</template>
