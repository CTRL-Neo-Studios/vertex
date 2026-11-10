<script setup lang="ts">
import type {GitToken} from "#shared/types/app/git";
import type {AppSettingPath} from "#shared/utils/settings/scopes";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {useWorkflowTrust} from "~/composables/workflows/useWorkflowTrust";
import {gitClient} from "~/utils/gitClient";

definePageMeta({
    layout: 'settings'
})

/**
 * Git: auto-sync (global, or a trusted workspace's own), and the personal access tokens saved in the keychain for
 * signing in to remotes (this computer's, whatever scope is edited).
 */
const {t} = useI18n()
const $qt = useQuickToasts()
const {load} = useAppSettings()
const scope = useSettingsScope()
const trust = useWorkflowTrust()

const tokens = ref<GitToken[]>([])
async function attempt(action: () => Promise<unknown>) {
    try {
        await action()
        tokens.value = await gitClient.tokens()
    } catch (error) {
        $qt.error(t('app.settings.git.failed'), String(error))
    }
}
onMounted(() => Promise.all([load(), attempt(async () => {})]))
const remove = (host: string) => attempt(() => gitClient.tokenSet(host, '', ''))

const AUTO = 'gitConfig.autoSync' as const
const INTERVAL = 'gitConfig.autoSync.interval' as const
const ON_OPEN = 'gitConfig.autoSync.onOpen' as const
const PULL_ON_FOCUS = 'gitConfig.autoSync.pullOnFocus' as const
const set = (path: AppSettingPath, value: unknown) => scope.set({[path]: value})
const intervals = computed(() => [0, 5, 15, 30, 60].map(minutes => ({
    label: minutes ? t('app.settings.git.autoSync.every', {minutes}) : t('app.settings.git.autoSync.never'),
    value: minutes,
})))
// Like the AI switches: a workspace's auto-sync applies only once its folder is trusted.
const untrusted = computed(() => scope.root.value !== null && scope.overridden(AUTO) && !scope.trusted.value)
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.git.title')">
        <div class="space-y-4">
            <SettingsSection
                v-if="scope.effective.value"
                :title="t('app.settings.git.autoSync.title')"
                :description="t('app.settings.git.autoSync.description')"
                :dirty="scope.isDirty([AUTO])"
                data-git-auto-sync
                @reset="scope.reset([AUTO])"
            >
                <div v-if="untrusted" class="px-4 py-2.5">
                    <UAlert
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-shield-alert"
                        :title="t('app.settings.git.autoSync.untrusted')"
                        :actions="[{label: t('app.settings.ai.features.trustWorkspace'), color: 'warning', variant: 'outline', onClick: () => trust.trustFolder(scope.root.value!, true)}]"
                    />
                </div>
                <SettingsRow :setting="INTERVAL" :label="t('app.settings.git.autoSync.interval')" :description="t('app.settings.git.autoSync.intervalDescription')">
                    <USelect class="w-40" :items="intervals" :model-value="scope.value(INTERVAL)" @update:model-value="set(INTERVAL, $event)"/>
                </SettingsRow>
                <SettingsRow :setting="ON_OPEN" :label="t('app.settings.git.autoSync.onOpen')" :description="t('app.settings.git.autoSync.onOpenDescription')">
                    <USwitch :model-value="scope.value(ON_OPEN)" @update:model-value="set(ON_OPEN, $event)"/>
                </SettingsRow>
                <SettingsRow :setting="PULL_ON_FOCUS" :label="t('app.settings.git.autoSync.pullOnFocus')" :description="t('app.settings.git.autoSync.pullOnFocusDescription')">
                    <USwitch :model-value="scope.value(PULL_ON_FOCUS)" @update:model-value="set(PULL_ON_FOCUS, $event)"/>
                </SettingsRow>
            </SettingsSection>
            <SettingsSection :title="t('app.settings.git.tokens')" :description="t('app.settings.git.tokensDescription')" data-git-tokens>
                <p v-if="!tokens.length" class="text-sm text-muted px-4 py-2.5">{{ t('app.settings.git.noTokens') }}</p>
                <SettingsRow
                    v-for="token in tokens"
                    :key="token.host"
                    :label="token.host"
                    :description="token.username ? t('app.settings.git.username', {username: token.username}) : undefined"
                >
                    <UButton size="sm" color="error" variant="soft" icon="i-lucide-trash-2" :label="t('app.settings.git.remove')" @click="remove(token.host)"/>
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
