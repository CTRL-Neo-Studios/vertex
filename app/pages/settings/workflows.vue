<script setup lang="ts">
import {hashProgram} from "@type32/workflows/core";
import {open} from "@tauri-apps/plugin-dialog";
import {readTextFile} from "@tauri-apps/plugin-fs";
import type {AppWorkflowConfig} from "#shared/types/app/settings";
import {defaultAppWorkflowConfig} from "#shared/utils/defaults/apps";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {trustedBy} from "#shared/workflows/trust";
import {useAppSettings} from "~/composables/app/useAppSettings";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {parseWorkflow} from "~/composables/workflows/useWorkflowRunner";
import {useWorkflowTrust} from "~/composables/workflows/useWorkflowTrust";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const $qt = useQuickToasts()
const {config, load, save} = useAppSettings()
const trust = useWorkflowTrust()
onMounted(() => Promise.all([load(), trust.load()]))

const defaults = defaultAppWorkflowConfig()
type LimitKey = 'maxLoopIterations' | 'maxStackDepth' | 'wallClockTimeoutMs'
const limitRows: {key: LimitKey, min: number}[] = [
    {key: 'maxLoopIterations', min: 1},
    {key: 'maxStackDepth', min: 1},
    {key: 'wallClockTimeoutMs', min: 0},
]

// Whole-object saves: settings merge only at the top level.
function set(patch: Partial<AppWorkflowConfig>) {
    return save({workflowConfig: {...config.value!.workflowConfig, ...patch}})
}
const limitsDirty = computed(() => limitRows.some(r => config.value?.workflowConfig[r.key] !== defaults[r.key]))
const fileTrustItems = computed(() => [
    {label: t('app.settings.workflows.fileTrustPath'), value: 'path'},
    {label: t('app.settings.workflows.fileTrustContent'), value: 'content'},
])

const query = ref('')
const shown = <R extends {path: string, trustedAt: string}>(records: R[]) => {
    const q = query.value.trim().toLowerCase()
    return records.filter(r => r.path.toLowerCase().includes(q)).sort((a, b) => b.trustedAt.localeCompare(a.trustedAt))
}
const folders = computed(() => shown(Object.entries(trust.records.value.folders).map(([path, r]) => ({path, ...r}))))
// A file a folder covers too stays trusted after it's revoked; the row says so.
const files = computed(() => shown(Object.entries(trust.records.value.files).map(([path, r]) => {
    const by = trustedBy({folders: trust.records.value.folders, files: {}}, path, '', 'path')
    return {path, ...r, coveredBy: by?.kind === 'folder' ? by.path : undefined}
})))
const any = computed(() => Object.keys(trust.records.value.folders).length + Object.keys(trust.records.value.files).length > 0)
const trustedAt = (date: string) => t('app.settings.workflows.trustedAt', {date: new Date(date).toLocaleString()})

async function attempt(action: () => Promise<unknown>) {
    try {
        await action()
    } catch (error) {
        $qt.error(t('app.settings.workflows.trustFailed'), String(error))
    }
}

const addFolder = () => attempt(async () => {
    const path = await open({directory: true, multiple: false})
    if (path) await trust.trustFolder(path, false)
})

// The hash is kept either way, so switching to content mode keeps this file trusted until it's edited.
const addFile = () => attempt(async () => {
    const path = await open({multiple: false, directory: false, filters: [{name: 'Workflow', extensions: ['workflow']}]})
    if (!path) return
    const {doc, problems} = parseWorkflow(await readTextFile(path))
    if (!doc) throw new Error(problems[0]?.message ?? t('app.editor.ui.workflow.invalid'))
    await trust.trustFile(path, await hashProgram(doc))
})
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.workflows.title')" v-if="config" global-only>
        <div class="space-y-4">
            <SettingsSection
                :title="t('app.settings.workflows.limits')"
                :dirty="limitsDirty"
                @reset="set({maxLoopIterations: defaults.maxLoopIterations, maxStackDepth: defaults.maxStackDepth, wallClockTimeoutMs: defaults.wallClockTimeoutMs})"
            >
                <SettingsRow
                    v-for="row in limitRows"
                    :key="row.key"
                    :label="t(`app.settings.workflows.${row.key}`)"
                    :description="t(`app.settings.workflows.${row.key}Description`)"
                >
                    <UInputNumber
                        class="w-40"
                        :min="row.min"
                        :model-value="config.workflowConfig[row.key]"
                        @update:model-value="$event !== null && $event >= row.min && set({[row.key]: $event})"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection
                :title="t('app.settings.workflows.safety')"
                :dirty="config.workflowConfig.confirmTrash !== defaults.confirmTrash || config.workflowConfig.fileTrust !== defaults.fileTrust"
                @reset="set({confirmTrash: defaults.confirmTrash, fileTrust: defaults.fileTrust})"
            >
                <SettingsRow :label="t('app.settings.workflows.confirmTrash')" :description="t('app.settings.workflows.confirmTrashDescription')">
                    <USwitch :model-value="config.workflowConfig.confirmTrash" @update:model-value="set({confirmTrash: $event})"/>
                </SettingsRow>
                <SettingsRow :label="t('app.settings.workflows.fileTrust')" :description="t('app.settings.workflows.fileTrustDescription')">
                    <USelect
                        class="w-56"
                        :items="fileTrustItems"
                        :model-value="config.workflowConfig.fileTrust"
                        @update:model-value="set({fileTrust: $event as AppWorkflowConfig['fileTrust']})"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.workflows.trusted')" :description="t('app.settings.workflows.trustedDescription')">
                <template #actions>
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-folder-plus" :label="t('app.settings.workflows.addFolder')" @click="addFolder"/>
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-file-plus" :label="t('app.settings.workflows.addFile')" @click="addFile"/>
                    <UButton v-if="any" size="xs" color="error" variant="ghost" icon="i-lucide-shield-off" :label="t('app.settings.workflows.revokeAll')" @click="attempt(trust.revokeAll)"/>
                </template>
                <div v-if="any" class="px-4 py-2.5">
                    <UInput v-model="query" class="w-full" size="sm" icon="i-lucide-search" :placeholder="t('app.settings.workflows.search')"/>
                </div>
                <p v-if="!folders.length && !files.length" class="text-sm text-muted px-4 py-2.5">
                    {{ t(any ? 'app.settings.workflows.noMatches' : 'app.settings.workflows.noTrusted') }}
                </p>
                <h3 v-if="folders.length" class="px-4 pt-2.5 pb-1 text-xs font-medium text-dimmed">{{ t('app.settings.workflows.folders') }}</h3>
                <SettingsRow
                    v-for="record in folders"
                    :key="`folder:${record.path}`"
                    :label="fileNameFromPath(record.path)"
                    :description="`${trustedAt(record.trustedAt)} · ${record.path}`"
                >
                    <USwitch
                        :label="t('app.settings.workflows.nested')"
                        :model-value="record.nested"
                        @update:model-value="attempt(() => trust.trustFolder(record.path, $event, record.trustedAt))"
                    />
                    <UButton size="sm" color="error" variant="soft" icon="i-lucide-shield-off" :label="t('app.settings.workflows.revoke')" @click="attempt(() => trust.revoke('folders', record.path))"/>
                </SettingsRow>
                <h3 v-if="files.length" class="px-4 pt-2.5 pb-1 text-xs font-medium text-dimmed">{{ t('app.settings.workflows.files') }}</h3>
                <SettingsRow
                    v-for="record in files"
                    :key="`file:${record.path}`"
                    :label="fileNameFromPath(record.path)"
                    :description="[trustedAt(record.trustedAt), record.path, record.coveredBy && t('app.settings.workflows.alsoTrustedBy', {folder: record.coveredBy})].filter(Boolean).join(' · ')"
                >
                    <UButton size="sm" color="error" variant="soft" icon="i-lucide-shield-off" :label="t('app.settings.workflows.revoke')" @click="attempt(() => trust.revoke('files', record.path))"/>
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
