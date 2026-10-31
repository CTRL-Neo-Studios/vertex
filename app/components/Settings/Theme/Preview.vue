<script setup lang="ts">
/** Real components in the current theme, plus the editor's text and code faces. */
const {t} = useI18n()
const toggled = ref(true)
</script>

<template>
    <div class="px-4 pb-4 pt-2 space-y-3">
        <div class="flex flex-wrap items-center gap-2">
            <UButton :label="t('app.settings.theme.previewSolid')" icon="i-lucide-check"/>
            <UButton :label="t('app.settings.theme.previewSoft')" variant="soft"/>
            <UButton :label="t('app.settings.theme.previewOutline')" color="neutral" variant="outline"/>
            <UBadge :label="t('app.settings.theme.previewBadge')" variant="subtle"/>
            <USwitch v-model="toggled"/>
            <UCheckbox v-model="toggled"/>
        </div>
        <UInput icon="i-lucide-search" :placeholder="t('app.settings.theme.previewInput')" class="w-full"/>
        <div class="rounded-md ring ring-default bg-elevated/40 p-3 space-y-2">
            <p class="font-editor text-lg font-semibold text-highlighted">{{ t('app.settings.theme.previewHeading') }}</p>
            <p class="font-editor text-sm text-default">
                {{ t('app.settings.theme.previewText') }}
                <span class="text-primary underline underline-offset-2">{{ t('app.settings.theme.previewLink') }}</span>
            </p>
            <pre class="font-editor-code text-xs text-muted bg-muted rounded-sm p-2">const vertex = { markdown: true }</pre>
        </div>
    </div>
</template>
