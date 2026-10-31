<script setup lang="ts">
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {fileNameFromPath} from "#shared/utils/fs/filenames";

interface RecentRecord {name: string, path: string, workspace: boolean}

const openingFile = ref(false)
const $act = useAppSessionActions()
const $sessions = useAppSessions()
const {t} = useI18n()

const recentsList = computed<RecentRecord[]>(() => unref($sessions.appSessions).map(s => ({
    name: s.rootFileOrFolderAbsolutePath ? fileNameFromPath(s.rootFileOrFolderAbsolutePath) : t('app.home.untitled'),
    path: s.rootFileOrFolderAbsolutePath || '',
    workspace: s.sessionType == 'workspace',
})))


async function openFile(path?: string) {
    openingFile.value = true
    if (!path)
        await $act.openSinglespaceAction()
    else
        await $act.openSinglespaceFromPath(path)
    openingFile.value = false
}

async function openFolder(path?: string) {
    openingFile.value = true
    if (!path)
        await $act.openWorkspaceAction()
    else
        await $act.openWorkspaceFromPath(path)
    openingFile.value = false
}

async function createFile() {
    openingFile.value = true
    await $act.createNewFileForSinglespace()
    openingFile.value = false
}

async function openPath(path: string | undefined, workspace: boolean) {
    if (workspace)
        await openFolder(path)
    else
        await openFile(path)
}

</script>

<template>
    <div class="w-full max-h-screen h-screen grid grid-cols-2">
        <div class="w-full max-h-screen flex flex-col items-center justify-center" data-tauri-drag-region>
            <div class="grid grid-cols-1 gap-2 select-none" data-tauri-drag-region>
                <img src="/icon.png" alt="vertex icon" class="size-24 justify-self-center"/>
                <div class="text-3xl font-bold text-center mb-6">Vertex</div>
                <UButton color="neutral" :label="$t('app.home.newFile')" icon="i-lucide-file-plus" class="cursor-pointer" variant="ghost" @click="createFile()" :disabled="openingFile"/>
                <UButton color="neutral" :label="$t('app.home.newWorkspace')" icon="i-lucide-folder-plus" class="cursor-pointer" variant="ghost" :disabled="openingFile"/>
                <UButton color="neutral" :label="$t('app.home.openFile')" class="cursor-pointer" variant="ghost" @click="openFile()" :disabled="openingFile"/>
                <UButton color="neutral" :label="$t('app.home.openFolder')" class="cursor-pointer" variant="ghost" @click="openFolder()" :disabled="openingFile"/>
            </div>
        </div>
        <div class="bg-submuted border-l border-l-default flex flex-col w-full max-h-screen select-none relative">
            <template v-if="recentsList.length">
                <div class="absolute align-middle bottom-0 w-full text-muted bg-default text-xs font-mono border-t border-default z-10">
                    <div class="flex p-1 px-2 pt-1.5 items-center justify-start align-middle w-full bg-submuted">{{ $t('app.home.recentFiles') }}</div>
                </div>
                <UScrollArea
                    data-tauri-drag-region
                    orientation="vertical"
                    :items="recentsList"
                    v-slot="{item, index}: {item: RecentRecord, index: number}"
                    class="w-full h-full pb-6"
                    virtualize
                >
                    <UButton
                        :key="index"
                        class="cursor-pointer justify-start rounded-none"
                        :icon="item.workspace ? 'i-lucide-folder' : 'i-lucide-file'"
                        color="neutral"
                        variant="ghost"
                        @click="openPath(item.path, item.workspace)"
                        block
                    >
                        <div class="flex flex-col justify-start items-start">
                            <div class="text-left">{{item.name}}</div>
                            <div class="text-muted text-xs text-left">{{item.path}}</div>
                        </div>
                    </UButton>
                </UScrollArea>
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
