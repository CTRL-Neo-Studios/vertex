<script setup lang="ts">
import {ScrollAreaRoot, ScrollAreaViewport, ScrollAreaScrollbar, ScrollAreaThumb} from "reka-ui";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useFileIO} from "~/composables/io/useFileIO";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";


const openingFile = ref(false)
const loadingRecents = ref(true)
const $act = useAppSessionActions()
const $menu = useAppWindowMenu()
const $sessions = useAppSessions()
const $fio = useFileIO()
const $win = useAppWebviewWindows()

onMounted(async () => {
    console.log(`Windows: ${await $win.getAppWindows()}`)
})

const recentsList = computedAsync(async (onCancel) => {
    const abortController = new AbortController()
    onCancel(() => abortController.abort())
    let results = []

    for (const s of unref($sessions.appSessions)) {
        results.push({
            name: await $fio.getFileNameFromPath(s.rootFileOrFolderAbsolutePath || 'Untitled'),
            path: s.rootFileOrFolderAbsolutePath,
            workspace: s.sessionType == 'workspace'
        })
    }

    return results;
}, [], loadingRecents)

$menu.dispatcher.on('categories.file.open.openFile', async () => {
    console.log('openfile')
    await openFile()
})
$menu.dispatcher.on('categories.file.open.openFolder', async () => {
    console.log('openfolder')
    await openFolder()
})
$menu.dispatcher.on('categories.file.new.newFile', async () => {
    await createFile()
})

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
    <div class="w-full h-screen grid grid-cols-2">
        <div class="w-full flex flex-col items-center justify-center" data-tauri-drag-region>
            <div class="grid grid-cols-1 gap-2 select-none" data-tauri-drag-region>
                <img src="/icon.png" alt="vertex icon" class="size-24 justify-self-center"/>
                <div class="text-3xl font-bold text-center mb-6">Vertex</div>
                <UButton color="neutral" label="New File..." icon="i-lucide-file-plus" class="cursor-pointer" variant="ghost" :disabled="openingFile"/>
                <UButton color="neutral" label="New Workspace..." icon="i-lucide-folder-plus" class="cursor-pointer" variant="ghost" :disabled="openingFile"/>
                <UButton color="neutral" label="Open File..." class="cursor-pointer" variant="ghost" @click="openFile()" :disabled="openingFile"/>
                <UButton color="neutral" label="Open Folder..." class="cursor-pointer" variant="ghost" @click="openFolder()" :disabled="openingFile"/>
            </div>
        </div>
        <div class="bg-submuted border-l border-l-default flex flex-col w-full h-full select-none">
            <ScrollAreaRoot class="max-h-screen relative" style="--scrollbar-size: 10px">
                <div class="text-xs text-muted/50 absolute top-0 bg-linear-to-t from-transparent via-submuted to-submuted h-12 p-3 w-full z-10">Recently Opened</div>
                <ScrollAreaViewport class="w-full h-full">
                    <div class="p-4 h-full w-full" v-if="loadingRecents">
                        <UProgress class="max-w-lg"/>
                    </div>
                    <div class="grid-cols-1 grid gap-1 p-3 pt-8" v-else>
                        <UButton
                            v-for="(record, index) in recentsList"
                            :key="index"
                            class="cursor-pointer"
                            :icon="record.workspace ? 'i-lucide-folder' : 'i-lucide-file'"
                            color="neutral"
                            variant="ghost"
                            @click="openPath(record.path, record.workspace)"
                        >
                            <div class="flex flex-col justify-start items-start">
                                <div class="text-left">{{record.name}}</div>
                                <div class="text-muted text-xs text-left">{{record.path}}</div>
                            </div>
                        </UButton>
                    </div>
                </ScrollAreaViewport>
                <ScrollAreaScrollbar
                    class="select-none touch-none z-20 w-2 m-2"
                    orientation="vertical"
                >
                    <ScrollAreaThumb
                        class="flex-1 bg-accented rounded-lg"
                    />
                </ScrollAreaScrollbar>
                <div class="text-xs text-muted/50 absolute bottom-0 bg-linear-to-b from-transparent to-submuted h-3 p-3 w-full z-10"/>
            </ScrollAreaRoot>
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
