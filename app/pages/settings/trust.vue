<script setup lang="ts">
import type {AppTrustConfig} from "#shared/types/app/settings";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {coveringFolder} from "#shared/utils/trust";
import {pickToOpen} from "~/utils/dialogs";
import {useAppSettings} from "~/composables/app/useAppSettings";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {useTrust} from "~/composables/app/useTrust";

definePageMeta({
    layout: 'settings'
})

/**
 * Settings → Trust: the trusted folders and files (`trust.json`), and what trust remembers. A trusted folder lets its
 * programs (workflows) run without asking, and a trusted workspace's own settings apply (custom CSS, plugins it turns
 * on, AI and git overrides). Global only.
 */
const {t} = useI18n()
const $qt = useQuickToasts()
const {config, load, save} = useAppSettings()
const trust = useTrust()
onMounted(() => Promise.all([load(), trust.load()]))

const fileTrustItems = computed(() => [
    {label: t('app.settings.trust.fileTrustPath'), value: 'path'},
    {label: t('app.settings.trust.fileTrustContent'), value: 'content'},
])
const setFileTrust = (fileTrust: AppTrustConfig['fileTrust']) => save({trustConfig: {fileTrust}})

const query = ref('')
const shown = <R extends {path: string, trustedAt: string}>(records: R[]) => {
    const q = query.value.trim().toLowerCase()
    return records.filter(r => r.path.toLowerCase().includes(q)).sort((a, b) => b.trustedAt.localeCompare(a.trustedAt))
}
const folders = computed(() => shown(Object.entries(trust.records.value.folders).map(([path, r]) => ({path, ...r}))))
// A file a folder covers too stays trusted after it's revoked; the row says so.
const files = computed(() => shown(Object.entries(trust.records.value.files).map(([path, r]) => {
    // In content mode a folder covers a file only with a pin for it.
    const folder = coveringFolder(trust.records.value, path)
    const covers = folder && (config.value?.trustConfig.fileTrust === 'path' || trust.records.value.folders[folder]!.files[path])
    return {path, ...r, coveredBy: covers ? folder : undefined}
})))
const any = computed(() => Object.keys(trust.records.value.folders).length + Object.keys(trust.records.value.files).length > 0)
const trustedAt = (date: string) => t('app.settings.trust.trustedAt', {date: new Date(date).toLocaleString()})
/** Files trust can hold: those of the formats plugins registered (`ctx.trust.format`). */
const fileExtensions = computed(() => trust.formatExtensions())

async function attempt(action: () => Promise<unknown>) {
    try {
        await action()
    } catch (error) {
        $qt.error(t('app.settings.trust.trustFailed'), String(error))
    }
}

const addFolder = () => attempt(async () => {
    const path = await pickToOpen({directory: true})
    if (path) await trust.trustFolder(path, false)
})

// The hash is kept either way, so switching to content mode keeps this file trusted until it's edited.
const addFile = () => attempt(async () => {
    const path = await pickToOpen({filters: [{name: t('app.settings.trust.programs'), extensions: fileExtensions.value}]})
    if (!path) return
    const hash = await trust.hashOf(path)
    if (!hash) throw new Error(t('app.settings.trust.unreadable', {name: fileNameFromPath(path)}))
    await trust.trustFile(path, hash)
})
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.trust.title')" v-if="config" global-only>
        <div class="space-y-4">
            <SettingsSection
                :title="t('app.settings.trust.remembers')"
                :dirty="config.trustConfig.fileTrust !== 'content'"
                @reset="setFileTrust('content')"
            >
                <SettingsRow :label="t('app.settings.trust.fileTrust')" :description="t('app.settings.trust.fileTrustDescription')">
                    <USelect
                        class="w-56"
                        :items="fileTrustItems"
                        :model-value="config.trustConfig.fileTrust"
                        @update:model-value="setFileTrust($event as AppTrustConfig['fileTrust'])"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.trust.trusted')" :description="t('app.settings.trust.trustedDescription')">
                <template #actions>
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-folder-plus" :label="t('app.settings.trust.addFolder')" @click="addFolder"/>
                    <UButton v-if="fileExtensions.length" size="xs" color="neutral" variant="ghost" icon="i-lucide-file-plus" :label="t('app.settings.trust.addFile')" @click="addFile"/>
                    <UButton v-if="any" size="xs" color="error" variant="ghost" icon="i-lucide-shield-off" :label="t('app.settings.trust.revokeAll')" @click="attempt(trust.revokeAll)"/>
                </template>
                <div v-if="any" class="px-4 py-2.5">
                    <UInput v-model="query" class="w-full" size="sm" icon="i-lucide-search" :placeholder="t('app.settings.trust.search')"/>
                </div>
                <p v-if="!folders.length && !files.length" class="text-sm text-muted px-4 py-2.5">
                    {{ t(any ? 'app.settings.trust.noMatches' : 'app.settings.trust.noTrusted') }}
                </p>
                <h3 v-if="folders.length" class="px-4 pt-2.5 pb-1 text-xs font-medium text-dimmed">{{ t('app.settings.trust.folders') }}</h3>
                <SettingsRow
                    v-for="record in folders"
                    :key="`folder:${record.path}`"
                    :label="fileNameFromPath(record.path)"
                    :description="`${trustedAt(record.trustedAt)} · ${t('app.settings.trust.pinned', {count: Object.keys(record.files).length})} · ${record.path}`"
                >
                    <USwitch
                        :label="t('app.settings.trust.nested')"
                        :model-value="record.nested"
                        @update:model-value="attempt(() => trust.trustFolder(record.path, $event, {trustedAt: record.trustedAt}))"
                    />
                    <UButton size="sm" color="error" variant="soft" icon="i-lucide-shield-off" :label="t('app.settings.trust.revoke')" @click="attempt(() => trust.revoke('folders', record.path))"/>
                </SettingsRow>
                <h3 v-if="files.length" class="px-4 pt-2.5 pb-1 text-xs font-medium text-dimmed">{{ t('app.settings.trust.files') }}</h3>
                <SettingsRow
                    v-for="record in files"
                    :key="`file:${record.path}`"
                    :label="fileNameFromPath(record.path)"
                    :description="[trustedAt(record.trustedAt), record.path, record.coveredBy && t('app.settings.trust.alsoTrustedBy', {folder: record.coveredBy})].filter(Boolean).join(' · ')"
                >
                    <UButton size="sm" color="error" variant="soft" icon="i-lucide-shield-off" :label="t('app.settings.trust.revoke')" @click="attempt(() => trust.revoke('files', record.path))"/>
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
