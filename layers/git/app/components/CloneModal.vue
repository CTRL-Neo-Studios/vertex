<script setup lang="ts">
import type {FormError} from "@nuxt/ui";
import {documentDir, join} from "@tauri-apps/api/path";
import {exists} from "@tauri-apps/plugin-fs";
import {gitContext} from "../plugin";
import {errorKey} from "../lib/repo";
import {useGitSignIn} from "../lib/signIn";
import {GitError, gitClient} from "../lib/client";

/** Clones a repository into a new folder; closes with that folder (to open as a workspace), or `undefined`. */
const emit = defineEmits<{ close: [string | undefined] }>()
const {t} = useI18n()
const signIn = useGitSignIn()

/** `parent` is always picked in the dialog: Rust clones only into a folder this window picked. */
const state = reactive({url: '', parent: '', name: ''})
/** `notes` from `https://host/me/notes.git` or `git@host:me/notes.git`. */
const nameOf = (url: string) => url.trim().replace(/\/+$/, '').replace(/\.git$/, '').split(/[/:]/).pop() ?? ''
// The folder's name follows the URL until the user types their own.
let named = false
watch(() => state.url, url => {
    if (!named) state.name = nameOf(url)
})
const nameTyped = () => void (named = true)
async function pickParent() {
    const path = await gitContext().dialogs.open({directory: true, title: t('plugins.git.clone.parentTitle'), defaultPath: state.parent || await documentDir().catch(() => undefined)})
    if (path) state.parent = path
}

function validate(s: typeof state): FormError[] {
    const errors: FormError[] = []
    if (!s.url.trim()) errors.push({name: 'url', message: t('app.generic.required')})
    if (!s.parent) errors.push({name: 'parent', message: t('app.generic.required')})
    if (!s.name.trim() || /[\\/]/.test(s.name)) errors.push({name: 'name', message: t('plugins.git.clone.badName')})
    return errors
}

const busy = ref(false)
const failure = ref('')
async function onSubmit() {
    busy.value = true
    failure.value = ''
    try {
        const url = state.url.trim()
        const dest = await join(state.parent, state.name.trim())
        if (await exists(dest)) {
            failure.value = t('plugins.git.clone.exists', {path: dest})
            return
        }
        // A remote that refuses to sign in asks for a token, then clones again.
        for (;;) {
            try {
                await gitClient.clone(url, dest)
                break
            } catch (e) {
                const error = String(e)
                if (error === GitError.auth && await signIn([url])) continue
                const key = errorKey(error)
                failure.value = key ? t(`plugins.git.errors.${key}.description`) : error
                return
            }
        }
        emit('close', dest)
    } finally {
        busy.value = false
    }
}
</script>

<template>
    <UModal :close="{ onClick: () => emit('close', undefined) }" :title="t('plugins.git.clone.title')" :description="t('plugins.git.clone.description')">
        <template #body>
            <UForm :validate :state class="p-2 w-full flex flex-col gap-3" data-git-clone @submit="onSubmit">
                <UFormField :label="t('plugins.git.clone.url')" name="url" required>
                    <UInput v-model="state.url" class="w-full" placeholder="https://github.com/you/notes.git" autocomplete="off" autofocus/>
                </UFormField>
                <UFormField :label="t('plugins.git.clone.parent')" name="parent" required>
                    <UFieldGroup class="w-full">
                        <UInput :model-value="state.parent" class="flex-1" readonly/>
                        <UButton color="neutral" variant="outline" icon="i-lucide-folder-open" :label="t('plugins.git.clone.choose')" @click="pickParent"/>
                    </UFieldGroup>
                </UFormField>
                <UFormField :label="t('plugins.git.clone.name')" name="name" :error="failure || undefined" required>
                    <UInput v-model="state.name" class="w-full" @update:model-value="nameTyped"/>
                </UFormField>
                <UButton type="submit" block :loading="busy" icon="i-lucide-download" :label="busy ? t('plugins.git.clone.cloning') : t('plugins.git.clone.action')"/>
            </UForm>
        </template>
    </UModal>
</template>
