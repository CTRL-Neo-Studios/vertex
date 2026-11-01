<script setup lang="ts">
import type {AppWorkflowConfig} from "#shared/types/app/settings";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {defaultAppWorkflowConfig} from "#shared/utils/defaults/apps";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {config, load, save} = useAppSettings()
onMounted(load)

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

function revoke(hash: string) {
    const {[hash]: _, ...rest} = config.value!.workflowConfig.trustedPrograms
    return set({trustedPrograms: rest})
}

const trusted = computed(() => Object.entries(config.value?.workflowConfig.trustedPrograms ?? {})
    .map(([hash, record]) => ({hash, ...record}))
    .sort((a, b) => b.trustedAt.localeCompare(a.trustedAt)))

const limitsDirty = computed(() => limitRows.some(r => config.value?.workflowConfig[r.key] !== defaults[r.key]))
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.workflows.title')" v-if="config">
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

            <SettingsSection :title="t('app.settings.workflows.safety')" :dirty="config.workflowConfig.confirmTrash !== defaults.confirmTrash" @reset="set({confirmTrash: defaults.confirmTrash})">
                <SettingsRow :label="t('app.settings.workflows.confirmTrash')" :description="t('app.settings.workflows.confirmTrashDescription')">
                    <USwitch :model-value="config.workflowConfig.confirmTrash" @update:model-value="set({confirmTrash: $event})"/>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.workflows.trusted')" :description="t('app.settings.workflows.trustedDescription')">
                <p v-if="!trusted.length" class="text-sm text-muted">{{ t('app.settings.workflows.noTrusted') }}</p>
                <SettingsRow
                    v-for="record in trusted"
                    :key="record.hash"
                    :label="record.name"
                    :description="`${t('app.settings.workflows.trustedAt', {date: new Date(record.trustedAt).toLocaleString()})} · ${record.hash.slice(0, 12)}`"
                >
                    <UButton size="sm" color="error" variant="soft" icon="i-lucide-shield-off" :label="t('app.settings.workflows.revoke')" @click="revoke(record.hash)"/>
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
