<script setup lang="ts">
import type {GitToken} from "#shared/types/app/git";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {gitClient} from "~/utils/gitClient";

definePageMeta({
    layout: 'settings'
})

/** Git: the personal access tokens saved in the keychain for signing in to remotes. */
const {t} = useI18n()
const $qt = useQuickToasts()

const tokens = ref<GitToken[]>([])
async function attempt(action: () => Promise<unknown>) {
    try {
        await action()
        tokens.value = await gitClient.tokens()
    } catch (error) {
        $qt.error(t('app.settings.git.failed'), String(error))
    }
}
onMounted(() => attempt(async () => {}))
const remove = (host: string) => attempt(() => gitClient.tokenSet(host, '', ''))
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.git.title')" global-only>
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
    </SettingsScrollLayout>
</template>
