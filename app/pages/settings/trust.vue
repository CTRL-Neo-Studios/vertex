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

const byDate = <R extends {trustedAt: string}>(records: R[]) => records.sort((a, b) => b.trustedAt.localeCompare(a.trustedAt))
const folders = computed(() => byDate(Object.entries(trust.records.value.folders).map(([path, r]) => ({path, ...r}))))
// A file a folder covers too stays trusted after it's revoked; the row says so.
const files = computed(() => byDate(Object.entries(trust.records.value.files).map(([path, r]) => {
    // In content mode a folder covers a file only with a pin for it.
    const folder = coveringFolder(trust.records.value, path)
    const covers = folder && (config.value?.trustConfig.fileTrust === 'path' || trust.records.value.folders[folder]!.files[path])
    return {path, ...r, coveredBy: covers ? folder : undefined}
})))
const any = computed(() => folders.value.length + files.value.length > 0)
const trustedAt = (date: string) => t('app.settings.trust.trustedAt', {date: new Date(date).toLocaleString()})
/** Folders, then files, each a row of the list: what it says under its name, and for a folder whether it takes its subfolders. */
const records = computed(() => [
    ...folders.value.map(r => ({
        id: `folders:${r.path}`, kind: 'folders' as const, path: r.path, trustedAt: r.trustedAt, nested: r.nested,
        detail: `${trustedAt(r.trustedAt)} · ${t('app.settings.trust.pinned', {count: Object.keys(r.files).length})} · ${r.path}`,
    })),
    ...files.value.map(r => ({
        id: `files:${r.path}`, kind: 'files' as const, path: r.path, trustedAt: r.trustedAt, nested: false,
        detail: [trustedAt(r.trustedAt), r.path, r.coveredBy && t('app.settings.trust.alsoTrustedBy', {folder: r.coveredBy})].filter(Boolean).join(' · '),
    })),
])
type TrustRow = typeof records.value[number]
const revoke = (rows: TrustRow[]) => attempt(async () => {
    for (const row of rows) await trust.revoke(row.kind, row.path)
})
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
                <SettingsRow :label="t('app.settings.trust.fileTrust')" :description="t('app.settings.trust.fileTrustDescription')" :info="t('app.settings.trust.fileTrustInfo')">
                    <USelect
                        class="w-56"
                        :items="fileTrustItems"
                        :model-value="config.trustConfig.fileTrust"
                        @update:model-value="setFileTrust($event as AppTrustConfig['fileTrust'])"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection
                :title="t('app.settings.trust.trusted')"
                :description="t('app.settings.trust.trustedDescription')"
                :info="t('app.settings.trust.trustedInfo')"
            >
                <template #actions>
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-folder-plus" :label="t('app.settings.trust.addFolder')" @click="addFolder"/>
                    <UButton v-if="fileExtensions.length" size="xs" color="neutral" variant="ghost" icon="i-lucide-file-plus" :label="t('app.settings.trust.addFile')" @click="addFile"/>
                    <UButton v-if="any" size="xs" color="error" variant="ghost" icon="i-lucide-shield-off" :label="t('app.settings.trust.revokeAll')" @click="attempt(trust.revokeAll)"/>
                </template>
                <SettingsList
                    :items="records"
                    :text="row => row.path"
                    :group="row => t(`app.settings.trust.${row.kind}`)"
                    :placeholder="t('app.settings.trust.search')"
                    :empty="t('app.settings.trust.noTrusted')"
                    :actions="[{id: 'revoke', label: count => t('app.settings.trust.revokeSelected', {count}), icon: 'i-lucide-shield-off', color: 'error',
                                confirm: count => t('app.settings.trust.revokeConfirm', {count}), run: revoke}]"
                >
                    <template #row="{item}">
                        <div class="text-sm text-default truncate">{{ fileNameFromPath(item.path) }}</div>
                        <div class="text-xs text-muted truncate" :title="item.detail">{{ item.detail }}</div>
                    </template>
                    <template #actions="{item}">
                        <USwitch
                            v-if="item.kind === 'folders'"
                            :label="t('app.settings.trust.nested')"
                            :model-value="item.nested"
                            @update:model-value="attempt(() => trust.trustFolder(item.path, $event, {trustedAt: item.trustedAt}))"
                        />
                        <UButton size="sm" color="error" variant="soft" icon="i-lucide-shield-off" :label="t('app.settings.trust.revoke')" @click="revoke([item])"/>
                    </template>
                </SettingsList>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
