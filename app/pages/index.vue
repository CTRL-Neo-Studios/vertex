<script setup lang="ts">
import {useAppRecents} from "~/composables/app/useAppRecents";
import {ScrollAreaRoot, ScrollAreaViewport, ScrollAreaScrollbar, ScrollAreaThumb} from "reka-ui";
import {useAppOpener} from "~/composables/app/useAppOpener";
import useUuid from "~/composables/utility/useUuid";
import {WebviewWindow} from "@tauri-apps/api/webviewWindow"
import type { PhysicalPosition } from "@tauri-apps/api/dpi";

const openingFile = ref(false)
const $recents = useAppRecents()
const {
    openFolderOrFile
} = useAppOpener()

async function openFile() {
    openingFile.value = true
    await openFolderOrFile(true)
    openingFile.value = false
}

async function openFolder() {
    openingFile.value = true
    await openFolderOrFile(false)
    openingFile.value = false
}

const state = useState<string>('dick', () => useUuid())

async function newWindow() {
    console.log('creating new window')
    const newwindow = unref(state)
    const appWindow = new WebviewWindow(`session-${newwindow}-window`, {
        url: '/',
        decorations: true,
        center: true,
        transparent: true,
        width: 900,
        height: 600,
        title: "Vertex",
        hiddenTitle: true,
        titleBarStyle: 'overlay',
        // @ts-ignore
        trafficLightPosition: {
            x: 14,
            y: 21
        }
    })
    await appWindow.once('tauri://webview-created', function () {
        console.log(unref(useState<string>('dick', () => useUuid())))
    })
    console.log('created new window')
}

onMounted(() => {
    console.log(unref(state))
})
</script>

<template>
    <div class="w-full h-screen grid grid-cols-2">
        <div class="w-full flex flex-col items-center justify-center" data-tauri-drag-region>
            <div class="grid grid-cols-1 gap-2 select-none" data-tauri-drag-region>
                <NuxtImg src="icon.png" class="size-24 justify-self-center"/>
                <div class="text-3xl font-bold text-center mb-6">Vertex</div>
                <UButton color="neutral" label="New File..." icon="i-lucide-file-plus" class="cursor-pointer" variant="ghost" :disabled="openingFile"/>
                <UButton color="neutral" label="New Workspace..." icon="i-lucide-folder-plus" class="cursor-pointer" variant="ghost" :disabled="openingFile"/>
                <UButton color="neutral" label="Open File..." class="cursor-pointer" variant="ghost" @click="openFile" :disabled="openingFile"/>
                <UButton color="neutral" label="Open Folder..." class="cursor-pointer" variant="ghost" @click="openFolder" :disabled="openingFile"/>
                <UButton @click="newWindow" label="new window"/>
            </div>
        </div>
        <div class="bg-submuted border-l border-l-default flex flex-col w-full h-full">
            <ScrollAreaRoot class="max-h-screen relative" style="--scrollbar-size: 10px">
                <div class="text-xs text-muted/50 absolute top-0 bg-linear-to-t from-transparent via-submuted to-submuted h-12 p-3 w-full z-10">Recently Opened</div>
                <ScrollAreaViewport class="w-full h-full">
                    <div class="grid-cols-1 grid gap-1 p-3 pt-8">
                        <UButton v-for="(record, index) in unref($recents.recents)?.recentRecords" :key="index" class="cursor-pointer" :icon="record.isWorkspace ? 'i-lucide-folder' : 'i-lucide-file'" color="neutral" variant="ghost">
                            <div class="flex flex-col justify-start items-start">
                                <div>{{record.name}}</div>
                                <div class="text-muted text-xs">{{record.fullPath}}</div>
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
