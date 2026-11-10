<script setup lang="ts">
import type {StepperItem} from "@nuxt/ui";
import {useAppOpener} from "~/composables/app/useAppOpener";
import type {GitSetupStep, useGitRepo} from "~/composables/git/useGitRepo";
import {gitClient} from "~/utils/gitClient";

/**
 * Setting up sync for a workspace: create the repository, your name and email, connect a remote, the first push
 * (signing in on the way, G6). The view shows it from Create repository until it's done or skipped; `single` runs one
 * step (a failure's toast sent the user here) and then finishes.
 */
const props = defineProps<{
    step: GitSetupStep,
    single?: boolean,
    git: ReturnType<typeof useGitRepo>,
    root: string,
    /** Chats are stored in the workspace, so the repository could hold them. */
    chatsInWorkspace: boolean,
}>()
const emit = defineEmits<{ next: [step: GitSetupStep], done: [] }>()
const {t} = useI18n()
const {openUrlInBrowser} = useAppOpener()
const {busy} = props.git

const items = computed<StepperItem[]>(() => [
    {value: 'create', title: t('app.git.setup.steps.create'), icon: 'i-lucide-git-branch-plus'},
    {value: 'identity', title: t('app.git.setup.steps.identity'), icon: 'i-lucide-user'},
    {value: 'remote', title: t('app.git.setup.steps.remote'), icon: 'i-lucide-cloud'},
    {value: 'push', title: t('app.git.setup.steps.push'), icon: 'i-lucide-arrow-up-from-line'},
])
const advance = (next: GitSetupStep) => (props.single ? emit('done') : emit('next', next))

// Create: chats are encrypted files git can't merge, so the user decides whether the repository keeps them.
const syncChats = ref(true)
async function create() {
    // Stay on the wizard while the view stops being "not a repository".
    emit('next', 'create')
    if (await props.git.init(syncChats.value)) emit('next', 'identity')
}

// Identity: what git already uses (the user's own config), else empty.
const identity = reactive({name: '', email: ''})
const remote = ref('')
watch(() => props.step, async step => {
    if (step === 'identity') Object.assign(identity, await gitClient.identity(props.root).catch(() => ({name: '', email: ''})))
    if (step === 'remote') remote.value = (await gitClient.remotes(props.root).catch(() => [])).find(r => r.name === 'origin')?.url ?? ''
}, {immediate: true})
const identityOk = computed(() => !!identity.name.trim() && /^[^\s@]+@[^\s@]+$/.test(identity.email.trim()))
async function saveIdentity() {
    if (identityOk.value && await props.git.setIdentity(identity.name, identity.email)) advance('remote')
}

async function connect() {
    if (remote.value.trim() && await props.git.connect(remote.value.trim())) advance('push')
}

async function push() {
    if (await props.git.sync(t('app.git.setup.firstCommit'))) emit('done')
}
</script>

<template>
    <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-4" data-git-setup>
        <UStepper v-if="!props.single" :items :model-value="props.step" size="xs" disabled :ui="{ title: 'text-xs', trigger: 'cursor-default' }"/>
        <template v-if="props.step === 'create'">
            <div>
                <h3 class="text-sm font-semibold text-highlighted">{{ t('app.git.notRepo.title') }}</h3>
                <p class="text-sm text-muted">{{ t('app.git.notRepo.description') }}</p>
            </div>
            <UCheckbox v-if="props.chatsInWorkspace" v-model="syncChats" size="sm" :label="t('app.git.syncChats')" :description="t('app.git.syncChatsHint')"/>
            <UButton block :label="t('app.git.createRepo')" icon="i-lucide-git-branch-plus" size="sm" :loading="!!busy" @click="create"/>
        </template>
        <form v-else-if="props.step === 'identity'" class="flex flex-col gap-3" @submit.prevent="saveIdentity">
            <div>
                <h3 class="text-sm font-semibold text-highlighted">{{ t('app.git.setup.identity.title') }}</h3>
                <p class="text-sm text-muted">{{ t('app.git.setup.identity.description') }}</p>
            </div>
            <UFormField :label="t('app.git.setup.identity.name')" size="sm">
                <UInput v-model="identity.name" class="w-full" autocomplete="name" autofocus/>
            </UFormField>
            <UFormField :label="t('app.git.setup.identity.email')" :hint="t('app.git.setup.identity.emailHint')" size="sm">
                <UInput v-model="identity.email" type="email" class="w-full" autocomplete="email"/>
            </UFormField>
            <UButton type="submit" block size="sm" :label="t('app.git.setup.continue')" :disabled="!identityOk" :loading="!!busy"/>
            <UButton v-if="props.single" block size="sm" color="neutral" variant="ghost" :label="t('app.git.setup.later')" @click="emit('done')"/>
        </form>
        <form v-else-if="props.step === 'remote'" class="flex flex-col gap-3" @submit.prevent="connect">
            <div>
                <h3 class="text-sm font-semibold text-highlighted">{{ t('app.git.setup.remote.title') }}</h3>
                <p class="text-sm text-muted">{{ t('app.git.setup.remote.description') }}</p>
            </div>
            <UButton
                block
                size="sm"
                color="neutral"
                variant="outline"
                icon="i-lucide-external-link"
                :label="t('app.git.setup.remote.github')"
                @click="openUrlInBrowser('https://github.com/new')"
            />
            <p class="text-xs text-muted">{{ t('app.git.setup.remote.empty') }}</p>
            <UFormField :label="t('app.git.setup.remote.url')" size="sm">
                <UInput v-model="remote" class="w-full" placeholder="https://github.com/you/notes.git" autocomplete="off" autofocus/>
            </UFormField>
            <UButton type="submit" block size="sm" :label="t('app.git.setup.remote.connect')" :disabled="!remote.trim()" :loading="!!busy"/>
            <UButton block size="sm" color="neutral" variant="ghost" :label="t('app.git.setup.later')" @click="emit('done')"/>
        </form>
        <template v-else>
            <div>
                <h3 class="text-sm font-semibold text-highlighted">{{ t('app.git.setup.push.title') }}</h3>
                <p class="text-sm text-muted">{{ t('app.git.setup.push.description') }}</p>
            </div>
            <UButton block size="sm" icon="i-lucide-arrow-up-from-line" :label="busy ?? t('app.git.setup.push.action')" :loading="!!busy" @click="push"/>
            <UButton block size="sm" color="neutral" variant="ghost" :label="t('app.git.setup.later')" @click="emit('done')"/>
        </template>
    </div>
</template>
