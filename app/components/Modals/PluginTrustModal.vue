<script setup lang="ts">
import type {WorkspacePlugin} from '~/utils/plugins/catalog'

/**
 * What accepting a workspace's plugins agrees to: each one's name, version, author and what it asks for, and that they
 * run as Vertex does. `folder`: asked before trusting that folder (Trust); else they're new or changed since they
 * were accepted (Run them). Closes with whether they're accepted.
 */
const props = defineProps<{
    plugins: readonly WorkspacePlugin[]
    folder?: string
}>()
const emit = defineEmits<{ close: [boolean] }>()
const {t} = useI18n()

const permission = (p: string) => t(`app.settings.plugins.permission.${p}`)
const rows = computed(() => props.plugins.map(({listed, manifest, errors}) => ({
    id: listed.id,
    name: manifest?.name ?? listed.id,
    line: manifest && [t('app.settings.plugins.version', {version: manifest.version}), manifest.author && t('app.settings.plugins.installModal.by', {author: manifest.author})].filter(Boolean).join(' · '),
    asks: manifest?.permissions?.length ? manifest.permissions.map(permission).join(', ') : t('app.settings.plugins.installModal.noPermissions'),
    errors,
})))
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="folder ? t('app.settings.plugins.trustModal.trustTitle', {folder}) : t('app.settings.plugins.trustModal.acceptTitle')"
        :description="folder ? t('app.settings.plugins.trustModal.trustDescription') : t('app.settings.plugins.trustModal.acceptDescription')"
    >
        <template #body>
            <div class="space-y-3 text-sm" data-plugin-trust>
                <ul class="space-y-2">
                    <li v-for="row in rows" :key="row.id" :data-plugin-trust-row="row.id">
                        <p class="font-medium">{{ row.name }}<span v-if="row.line" class="text-muted font-normal"> · {{ row.line }}</span></p>
                        <p v-if="row.errors.length" class="text-error">{{ t('app.settings.plugins.broken', {reasons: row.errors.join('; ')}) }}</p>
                        <p v-else class="text-muted">{{ t('app.settings.plugins.trustModal.asks', {list: row.asks}) }}</p>
                    </li>
                </ul>
                <UAlert color="warning" variant="subtle" icon="i-lucide-shield-alert" :description="t('app.settings.plugins.installModal.warning')"/>
            </div>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="outline" :label="t('app.settings.plugins.installModal.cancel')" @click="() => emit('close', false)"/>
                <UButton
                    size="sm"
                    color="warning"
                    :label="folder ? t('app.settings.plugins.trustModal.trust') : t('app.settings.plugins.trustModal.accept')"
                    data-plugin-trust-confirm
                    @click="() => emit('close', true)"
                />
            </div>
        </template>
    </UModal>
</template>
