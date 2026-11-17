<script setup lang="ts">
import type {SettingsPageProps} from "#shared/plugin/api";
import {SettingsRow, SettingsScrollLayout, SettingsSection} from "~/plugin/ui";
import type {GitToken} from "../../shared/types";
import {gitConfigOf} from "../../shared/config";
import {gitContext} from "../plugin";
import {useNotify} from "../lib/notify";
import {gitClient} from "../lib/client";

/**
 * Git: auto-sync (global, or a trusted workspace's own), AI commit messages while the AI plugin is on, and the personal access tokens saved in the keychain for
 * signing in to remotes (this computer's, whatever scope is edited).
 */
const props = defineProps<SettingsPageProps>()
const {t} = useI18n()
const $qt = useNotify()

const tokens = ref<GitToken[]>([])
async function attempt(action: () => Promise<unknown>) {
    try {
        await action()
        tokens.value = await gitClient.tokens()
    } catch (error) {
        $qt.error(t('plugins.git.settings.failed'), String(error))
    }
}
onMounted(() => attempt(async () => {}))
const remove = (host: string) => attempt(() => gitClient.tokenSet(host, '', ''))

const AUTO = 'autoSync'
const INTERVAL = 'autoSync.interval'
const ON_OPEN = 'autoSync.onOpen'
const PULL_ON_FOCUS = 'autoSync.pullOnFocus'
const COMMIT_MESSAGES = 'commitMessages'
const COMMIT_KEYS = ['whenEmpty', 'autoSync'] as const
/** What each key is when nothing sets it: what Reset puts back in User. */
const DEFAULTS = gitConfigOf() as unknown as Record<string, unknown>
const set = (path: string, value: unknown) => props.config.set({[path]: value})
const intervals = computed(() => [0, 5, 15, 30, 60].map(minutes => ({
    label: minutes ? t('plugins.git.settings.autoSync.every', {minutes}) : t('plugins.git.settings.autoSync.never'),
    value: minutes,
})))
// Like the AI switches: a workspace's auto-sync applies only once its folder is trusted.
const untrusted = computed(() => props.config.root !== null && props.config.overridden(AUTO) && !props.config.trusted)
</script>

<template>
    <SettingsScrollLayout :title="t('plugins.git.settings.title')">
        <div class="space-y-4">
            <SettingsSection
                :title="t('plugins.git.settings.autoSync.title')"
                :description="t('plugins.git.settings.autoSync.description')"
                :dirty="config.isDirty([AUTO], DEFAULTS)"
                data-git-auto-sync
                @reset="config.reset([AUTO], DEFAULTS)"
            >
                <div v-if="untrusted" class="px-4 py-2.5">
                    <UAlert
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-shield-alert"
                        :title="t('plugins.git.settings.autoSync.untrusted')"
                        :actions="[{label: t('plugins.git.settings.trustWorkspace'), color: 'warning', variant: 'outline', onClick: () => gitContext().trust.trustFolder(config.root!, true)}]"
                    />
                </div>
                <SettingsRow :setting="config.path(INTERVAL)" :label="t('plugins.git.settings.autoSync.interval')" :description="t('plugins.git.settings.autoSync.intervalDescription')">
                    <USelect class="w-40" :items="intervals" :model-value="config.value(INTERVAL) as number" @update:model-value="set(INTERVAL, $event)"/>
                </SettingsRow>
                <SettingsRow :setting="config.path(ON_OPEN)" :label="t('plugins.git.settings.autoSync.onOpen')" :description="t('plugins.git.settings.autoSync.onOpenDescription')">
                    <USwitch :model-value="config.value(ON_OPEN) as boolean" @update:model-value="set(ON_OPEN, $event)"/>
                </SettingsRow>
                <SettingsRow :setting="config.path(PULL_ON_FOCUS)" :label="t('plugins.git.settings.autoSync.pullOnFocus')" :description="t('plugins.git.settings.autoSync.pullOnFocusDescription')">
                    <USwitch :model-value="config.value(PULL_ON_FOCUS) as boolean" @update:model-value="set(PULL_ON_FOCUS, $event)"/>
                </SettingsRow>
            </SettingsSection>
            <SettingsSection
                v-if="gitContext().use('ai')"
                :title="t('plugins.git.commitMessageFeature.label')"
                :dirty="config.isDirty([COMMIT_MESSAGES], DEFAULTS)"
                @reset="config.reset([COMMIT_MESSAGES], DEFAULTS)"
            >
                <SettingsRow
                    v-for="key in COMMIT_KEYS"
                    :key
                    :setting="config.path(`${COMMIT_MESSAGES}.${key}`)"
                    :label="t(`plugins.git.settings.commitMessages.${key}`)"
                    :description="t(`plugins.git.settings.commitMessages.${key}Description`)"
                >
                    <USwitch :model-value="config.value(`${COMMIT_MESSAGES}.${key}`) as boolean" @update:model-value="set(`${COMMIT_MESSAGES}.${key}`, $event)"/>
                </SettingsRow>
            </SettingsSection>
            <SettingsSection :title="t('plugins.git.settings.tokens')" :description="t('plugins.git.settings.tokensDescription')" data-git-tokens>
                <p v-if="!tokens.length" class="text-sm text-muted px-4 py-2.5">{{ t('plugins.git.settings.noTokens') }}</p>
                <SettingsRow
                    v-for="token in tokens"
                    :key="token.host"
                    :label="token.host"
                    :description="token.username ? t('plugins.git.settings.username', {username: token.username}) : undefined"
                >
                    <UButton size="sm" color="error" variant="soft" icon="i-lucide-trash-2" :label="t('plugins.git.settings.remove')" @click="remove(token.host)"/>
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
