<script setup lang="ts">
import type {FormError} from "@nuxt/ui";
import type {GitToken} from "#shared/types/app/git";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {gitClient} from "~/utils/gitClient";

/**
 * Asks for a personal access token after a remote refused to sign in, and saves it in the keychain for its host;
 * closes `true` once saved (to retry), `false` when dismissed.
 */
const props = defineProps<{
    /** The https hosts of the repository's remotes, with the username their URL names (`''` when none). */
    hosts: GitToken[],
    /** Hosts with a saved token: for these, the token was refused. */
    saved: GitToken[],
}>()
const emit = defineEmits<{ close: [boolean] }>()
const {t} = useI18n()
const {openUrlInBrowser} = useAppOpener()

/** Where well-known hosts make tokens, with what git needs already chosen. */
const TOKEN_PAGES: Record<string, string> = {
    'github.com': 'https://github.com/settings/tokens/new?scopes=repo&description=Vertex',
    'gitlab.com': 'https://gitlab.com/-/user_settings/personal_access_tokens?name=Vertex&scopes=read_repository,write_repository',
    'codeberg.org': 'https://codeberg.org/user/settings/applications',
}

const state = reactive({host: props.hosts[0]?.host ?? '', username: '', token: ''})
const refused = computed(() => props.saved.find(s => s.host === state.host))
// A saved username wins over the URL's: it worked with a token before.
watch(() => state.host, host => {
    state.username = refused.value?.username || props.hosts.find(h => h.host === host)?.username || ''
}, {immediate: true})
const tokenPage = computed(() => TOKEN_PAGES[state.host])

const busy = ref(false)
const failure = ref('')

function validate(s: typeof state): FormError[] {
    return s.token.trim() ? [] : [{name: 'token', message: t('app.generic.required')}]
}

async function onSubmit() {
    busy.value = true
    failure.value = ''
    try {
        await gitClient.tokenSet(state.host, state.username, state.token)
        emit('close', true)
    } catch (e) {
        failure.value = String(e)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', false) }"
        :title="t('app.git.signIn.title', {host: state.host})"
        :description="t(refused ? 'app.git.signIn.refused' : 'app.git.signIn.description', {host: state.host})"
        size="sm"
    >
        <template #body>
            <UForm :validate :state class="p-2 w-full flex flex-col gap-3" data-git-sign-in @submit="onSubmit">
                <UFormField v-if="props.hosts.length > 1" :label="t('app.git.signIn.host')" name="host">
                    <USelect v-model="state.host" :items="props.hosts.map(h => h.host)" class="w-full"/>
                </UFormField>
                <p class="text-sm text-muted">{{ t('app.git.signIn.explain') }}</p>
                <UButton
                    v-if="tokenPage"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-external-link"
                    :label="t('app.git.signIn.create', {host: state.host})"
                    @click="openUrlInBrowser(tokenPage)"
                />
                <p v-else class="text-sm text-muted">{{ t('app.git.signIn.createElsewhere', {host: state.host}) }}</p>
                <UFormField :label="t('app.git.signIn.token')" name="token" :error="failure || undefined" required>
                    <UInput v-model="state.token" type="password" class="w-full" autocomplete="off" autofocus/>
                </UFormField>
                <UFormField :label="t('app.git.signIn.username')" :hint="t('app.git.signIn.optional')" :description="t('app.git.signIn.usernameHelp')" name="username">
                    <UInput v-model="state.username" class="w-full" autocomplete="off"/>
                </UFormField>
                <p class="text-xs text-muted">{{ t('app.git.signIn.kept', {host: state.host}) }}</p>
                <UButton type="submit" block :loading="busy" icon="i-lucide-key-round" :label="t('app.git.signIn.save')"/>
            </UForm>
        </template>
    </UModal>
</template>
