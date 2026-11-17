<script setup lang="ts">
import type {PluginManifest} from '#shared/plugin/manifest'

/**
 * What installing a community plugin is agreeing to: its name, author and version, the permissions it asks for, and
 * that it runs as Vertex does. With `errors` (its manifest didn't validate) it can only be cancelled.
 */
const props = defineProps<{
    manifest: Partial<PluginManifest>
    errors: string[]
    /** The version installed now, when this replaces it. */
    replaces?: string
}>()
const emit = defineEmits<{ close: [boolean] }>()
const {t} = useI18n()
const name = computed(() => (typeof props.manifest.name === 'string' && props.manifest.name) || props.manifest.id || '?')
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="errors.length ? t('app.settings.plugins.installModal.invalid') : t('app.settings.plugins.installModal.title', {name})"
        :description="[manifest.version && t('app.settings.plugins.version', {version: manifest.version}), manifest.author && t('app.settings.plugins.installModal.by', {author: manifest.author})].filter(Boolean).join(' · ')"
    >
        <template #body>
            <div class="space-y-3 text-sm" data-plugin-install>
                <UAlert
                    v-if="errors.length"
                    color="error"
                    variant="subtle"
                    icon="i-lucide-file-x"
                    :title="t('app.settings.plugins.installModal.errors')"
                    data-plugin-install-errors
                >
                    <template #description>
                        <ul class="list-disc ps-4">
                            <li v-for="error in errors" :key="error">{{ error }}</li>
                        </ul>
                    </template>
                </UAlert>
                <template v-else>
                    <p v-if="manifest.description" class="text-muted">{{ manifest.description }}</p>
                    <p v-if="replaces" class="text-muted">{{ t('app.settings.plugins.installModal.replaces', {version: replaces}) }}</p>
                    <div>
                        <p class="font-medium">{{ t('app.settings.plugins.installModal.permissions') }}</p>
                        <ul v-if="manifest.permissions?.length" class="list-disc ps-5 text-muted">
                            <li v-for="p in manifest.permissions" :key="p">{{ t(`app.settings.plugins.permission.${p}`) }}</li>
                        </ul>
                        <p v-else class="text-muted">{{ t('app.settings.plugins.installModal.noPermissions') }}</p>
                    </div>
                    <UAlert color="warning" variant="subtle" icon="i-lucide-shield-alert" :description="t('app.settings.plugins.installModal.warning')"/>
                </template>
            </div>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="outline" :label="t('app.settings.plugins.installModal.cancel')" @click="() => emit('close', false)"/>
                <UButton v-if="!errors.length" size="sm" :label="t('app.settings.plugins.installModal.install')" data-plugin-install-confirm @click="() => emit('close', true)"/>
            </div>
        </template>
    </UModal>
</template>
