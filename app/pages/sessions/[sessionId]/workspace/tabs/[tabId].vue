<script setup lang="ts">
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useFileIO} from "~/composables/io/useFileIO";
import {ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport, ScrollAreaRoot} from "reka-ui";
import type {InternalLink, SpecialCodeBlockMapping} from "#codemirror-rich-obsidian-editor/editor-types"

definePageMeta({
    layout: 'workspace'
})

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $fileio = useFileIO()
const sessionId = computed<string>(() => $route.params.sessionId as string), tabId = computed<string>(() => $route.params.tabId as string)
// the isContentSaved here is the equivalent of determining whether a file is dirty. If in any operations in this file does shit to the content, just make it false, i.e. marking it dirty.
const content = useState<string>(`active.tabs.currentTab.${unref(sessionId)}.${unref(tabId)}`), isContentSaved = ref(true)
const {
    on,
    getFileByUuid,
    moveFileInIndex,
    fileIndex
} = useActiveWorkspaceIndex($sesh.getSession(sessionId))
const {
    closeTab,
    activeTabUuid,
    getActiveTab,
    isTabOpened,
    setTabSavedState,
} = useActiveTabs($sesh.getSession(sessionId))
const cachedFileIndex = getFileByUuid(unref(tabId))

const fileName = ref<string>($fileio.processFileNameFromPath(getFileByUuid(unref(tabId))?.fullPath || '', true))
const internalLinkList = computed<InternalLink[]>(() => {
    const list: InternalLink[] = []
    for (const path in unref(fileIndex)) {
        if(!unref(fileIndex)[path]) continue;
        const fn = unref(fileIndex)[path]?.fileName
        if(!fn) continue;

        list.push({
            internalLinkName: $fileio.processFileNameFromPath(fn, true),
            filePath: path,
            redirectToPath: ''
        } satisfies InternalLink)
    }

    return list
})

watch(isContentSaved, (newValue) => {
    setTabSavedState(tabId, newValue)
}, {deep: false})

watch(fileIndex, () => {
    console.log('File Index Changed')
})

debouncedWatch(content, async () => {
    const fullFilePath = getFileByUuid(tabId)?.fullPath;
    if (!fullFilePath) return;

    isContentSaved.value = false;

    try {
        await $fileio.writeTextToFile(fullFilePath, content.value);
        isContentSaved.value = true;
    } catch (error) {
        console.error("Auto-save failed:", error);
    }
}, {deep: false, debounce: 500, maxWait: 1000 })

onMounted(async () => {
    if (!isTabOpened(unref(tabId)))
        await $navi.toWorkspaceEmptyTab(unref(sessionId))

    const currentIndexFile = getFileByUuid(tabId)
    if (currentIndexFile?.fullPath)
        content.value = await $fileio.readTextFromFile(currentIndexFile.fullPath)
})

on(async (event) => {
    console.log(event)
    if (event.type == "remove" && event.path == cachedFileIndex?.fullPath) {
        closeTab(tabId)
        await $navi.toWorkspaceEmptyTab(sessionId)
    } else if (event.type == "modify" && event.path == getFileByUuid(tabId)?.fullPath) {
        // isContentSaved.value = false
        // content.value = await $fileio.readTextFromFile(event.path)
    } else if (event.type == "rename" && (event.oldPath == getFileByUuid(tabId)?.fullPath || event.newPath == getFileByUuid(tabId)?.fullPath)) {
        isContentSaved.value = false
        fileName.value = await $fileio.getFileNameFromPath(event.newPath, true)
        isContentSaved.value = true
    }
})

async function onRename() {
    isContentSaved.value = false
    const fullPath = getFileByUuid(tabId)?.fullPath
    if (fullPath) {
        const newPath = await $fileio.renameFileOrFolder(fullPath, unref(fileName))
    }
    isContentSaved.value = true;
}
watch(fileName, () => {
    console.log(unref(fileName))
})
</script>

<template>
    <!--
  This div and the ScrollAreaRoot below it now correctly fill the fixed-height
  container provided by the layout's slot.
-->
    <div class="w-full h-full">
        <ScrollAreaRoot
            class="w-full h-full flex flex-col relative"
            :style="{ height: 'calc(100vh - var(--ui-header-height) - 0.7rem)' }"
        >
            <div class="absolute z-10 bg-gradient-to-t from-transparent via-default to-default left-0 right-0 top-0 h-10 rounded-t-lg">
                <div class="w-full flex items-center justify-center p-2">
                    <div class="flex-grow flex items-center justify-center">
                        <TextPreviewEditField v-model="fileName" @on-rename="onRename" class="w-fit"/>
                    </div>
                </div>
            </div>
            <ScrollAreaViewport class="w-full flex-none h-full">
                <!-- This div can add padding or alignment for the editor -->
                <div class="flex flex-col items-center justify-start md:p-0 mb-16 mt-10">
                    <!-- The editor is free to be as tall as its content requires -->
                    <Editor v-model="content" class="max-w-2xl w-full" :internal-link-map="internalLinkList" @update:model-value="() => isContentSaved = false"/>
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
            <div class="absolute z-10 bg-gradient-to-b from-transparent to-default left-0 right-0 bottom-0 h-6 rounded-b-lg"/>
        </ScrollAreaRoot>
    </div>

</template>

<style scoped>

</style>