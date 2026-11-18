<script setup lang="ts">
/**
 * The info button beside a row's label or a section's title: what takes more than a line to say (why, what's sent,
 * what trust means), a click away instead of under every label.
 */
defineProps<{ text: string }>()
</script>

<template>
    <UPopover :content="{side: 'bottom', align: 'start'}">
        <UButton
            icon="i-lucide-info"
            size="xs"
            color="neutral"
            variant="link"
            class="p-0 text-dimmed hover:text-default"
            :aria-label="$t('app.settings.info')"
            data-settings-info
        />
        <template #content>
            <p class="max-w-xs p-3 text-xs text-toned whitespace-pre-line">{{ text }}</p>
        </template>
    </UPopover>
</template>
