<script setup lang="ts">
import {StateKey} from "#shared/constants/app";
import type {AppSession} from "#shared/types/app/sessions";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useRecents, type RecentEntry} from "~/composables/app/useRecents";
import WorkspaceBadge from "~/components/WorkspaceBadge.vue";

const openingFile = ref(false)
const $act = useAppSessionActions()
const $sessions = useAppSessions()
const recents = useRecents()
const {t} = useI18n()

/** Windows the last launch's recovery couldn't reopen: their folder or file is gone. */
const missingAtLaunch = useState<AppSession[] | undefined>(StateKey.recoveryMissing)

const sections = computed(() => [
    {id: 'workspaces', title: t('app.home.recentWorkspaces'), entries: recents.workspaces.value},
    {id: 'files', title: t('app.home.recentFiles'), entries: recents.files.value},
])
const empty = computed(() => sections.value.every(s => !s.entries.length))

async function busy(run: () => Promise<unknown>) {
    openingFile.value = true
    try {
        await run()
    } finally {
        openingFile.value = false
    }
}

async function removeMissingAtLaunch() {
    for (const s of missingAtLaunch.value ?? []) await $sessions.removeAppSession(s.uuid)
    missingAtLaunch.value = undefined
}

const openEntry = (entry: RecentEntry) => busy(() => recents.open(entry))
</script>

<template>
    <div class="w-full max-h-screen h-screen grid grid-cols-2">
        <div class="w-full max-h-screen flex flex-col items-center justify-center" data-tauri-drag-region>
            <div class="grid grid-cols-1 gap-2 select-none" data-tauri-drag-region>
                <img src="/icon.png" alt="vertex icon" class="size-24 justify-self-center"/>
                <div class="text-3xl font-bold text-center mb-6">Vertex</div>
                <UButton color="neutral" :label="$t('app.home.newFile')" icon="i-lucide-file-plus" class="cursor-pointer" variant="ghost" :disabled="openingFile" @click="busy($act.createNewFileForSinglespace)"/>
                <UButton color="neutral" :label="$t('app.home.newWorkspace')" icon="i-lucide-folder-plus" class="cursor-pointer" variant="ghost" :disabled="openingFile" @click="busy($act.newWorkspaceAction)"/>
                <UButton color="neutral" :label="$t('app.home.openFile')" icon="i-lucide-file" class="cursor-pointer" variant="ghost" :disabled="openingFile" @click="busy($act.openSinglespaceAction)"/>
                <UButton color="neutral" :label="$t('app.home.openFolder')" icon="i-lucide-folder-open" class="cursor-pointer" variant="ghost" :disabled="openingFile" @click="busy($act.openWorkspaceAction)"/>
            </div>
        </div>
        <div class="bg-submuted border-l border-l-default flex flex-col w-full max-h-screen overflow-y-auto select-none pb-4" data-tauri-drag-region>
            <UAlert
                v-if="missingAtLaunch?.length"
                class="m-3 mb-0 w-auto"
                color="warning"
                variant="subtle"
                icon="i-lucide-folder-x"
                :title="$t('app.home.recoveryMissing', { count: missingAtLaunch.length })"
                :description="missingAtLaunch.map(s => s.rootFileOrFolderAbsolutePath).join('\n')"
                :actions="[{ label: $t('app.home.removeRecent'), color: 'warning', variant: 'soft', size: 'xs', onClick: removeMissingAtLaunch }]"
                :close="{ onClick: () => { missingAtLaunch = undefined } }"
                :ui="{ description: 'whitespace-pre-line break-all' }"
            />
            <div v-if="empty" class="m-auto text-sm text-muted" data-tauri-drag-region>{{ $t('app.home.noRecents') }}</div>
            <template v-for="section in sections" :key="section.id">
                <div v-if="section.entries.length" class="px-4 pt-5 pb-1 text-xs font-medium text-muted" data-tauri-drag-region>{{ section.title }}</div>
                <div
                    v-for="entry in section.entries"
                    :key="entry.session.uuid"
                    role="button"
                    tabindex="0"
                    :title="entry.path"
                    :class="['group flex items-center gap-3 px-4 py-1.5 cursor-pointer hover:bg-elevated/60 focus-visible:bg-elevated/60 outline-none', entry.missing && 'opacity-50']"
                    @click="openEntry(entry)"
                    @keydown.enter.self="openEntry(entry)"
                >
                    <WorkspaceBadge v-if="section.id === 'workspaces'" :path="entry.path" size="md"/>
                    <UIcon v-else name="i-lucide-file-text" class="size-5 mx-1 shrink-0 text-muted"/>
                    <div class="min-w-0 grow">
                        <div class="truncate text-sm">{{ entry.name }}</div>
                        <div class="truncate text-xs text-muted">
                            <span v-if="entry.missing">{{ $t('app.home.missing') }} · </span>{{ entry.path }}
                        </div>
                    </div>
                    <UTooltip :text="entry.session.pinned ? $t('app.home.unpin') : $t('app.home.pin')">
                        <UButton
                            icon="i-lucide-pin"
                            size="xs"
                            :color="entry.session.pinned ? 'primary' : 'neutral'"
                            variant="ghost"
                            :class="entry.session.pinned ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'"
                            :aria-label="entry.session.pinned ? $t('app.home.unpin') : $t('app.home.pin')"
                            @click.stop="recents.setPinned(entry, !entry.session.pinned)"
                        />
                    </UTooltip>
                    <UTooltip v-if="!entry.session.open" :text="$t('app.home.removeRecent')">
                        <UButton
                            icon="i-lucide-x"
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            class="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                            :aria-label="$t('app.home.removeRecent')"
                            @click.stop="recents.remove(entry)"
                        />
                    </UTooltip>
                </div>
            </template>
        </div>
    </div>
</template>

<style>
@reference "~/assets/css/main.css";
/*
 * KILL THE NATIVE WEBVIEW SCROLLBARS
 * This is for WebKit (macOS, Linux)
 * It hides the scrollbar UI but maintains scrolling functionality,
 * allowing custom scrollbar components like reka-ui to work correctly.
*/
::-webkit-scrollbar {
    display: none;
}

/*
 * Optional but recommended: For completeness if you ever build for Windows
 * or use a different webview provider.
*/
html {
    -ms-overflow-style: none;  /* IE and Edge */
    scrollbar-width: none;     /* Firefox */
}
</style>
