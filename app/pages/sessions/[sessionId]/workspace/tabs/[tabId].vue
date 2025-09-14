<script setup lang="ts">
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useFileIO} from "~/composables/io/useFileIO";
import {ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport, ScrollAreaRoot} from "reka-ui";
import type {InternalLink, SpecialCodeBlockMapping, InternalLinkClickDetail} from "#codemirror-rich-obsidian-editor/editor-types"
import EditorHeaderBreadcrumbs from "~/components/EditorHeaderBreadcrumbs.vue";

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
const isContentLoaded = ref(false), isRenaming = ref(false);
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
    openTab
} = useActiveTabs($sesh.getSession(sessionId))
const cachedFileIndex = getFileByUuid(unref(tabId))

const fileName = ref<string>($fileio.processFileNameFromPath(getFileByUuid(unref(tabId))?.fullPath || '', true))
const internalLinkList = computed<InternalLink[]>(() => {
    const list: InternalLink[] = []
    for (const path in unref(fileIndex)) {
        const f = unref(fileIndex)[path]
        if(!f) continue;
        const fn = f.fileName
        if(!fn) continue;

        list.push({
            internalLinkName: $fileio.processFileNameFromPath(fn, true),
            filePath: f.relativePath,
            redirectToPath: f.uuid
        } satisfies InternalLink)
    }

    return list
})

async function onInternalLinkClick(args: InternalLinkClickDetail) {
    const {redirectToPath} = args
    if (redirectToPath) {
        const tab = openTab(redirectToPath)
        await $navi.toWorkspaceTab(sessionId, tab)
    }
}

watch(isContentSaved, (newValue) => {
    setTabSavedState(tabId, newValue)
}, {deep: false})

watch(fileIndex, () => {
    console.log('File Index Changed')
}, { deep: true })

debouncedWatch(content, async () => {
    if (!isContentLoaded.value) return;

    isContentSaved.value = false;

    try {
        await until(isRenaming).toMatch(i => i == false)
        await $fileio.writeTextToFile(getFileByUuid(tabId)?.fullPath, content.value);
        isContentSaved.value = true;
    } catch (error) {
        console.error("Auto-save failed:", error);
    }
}, {deep: false, debounce: 500, maxWait: 1000 })

onMounted(async () => {
    if (!isTabOpened(unref(tabId)))
        await $navi.toWorkspaceEmptyTab(unref(sessionId))

    const currentIndexFile = getFileByUuid(tabId)
    if (currentIndexFile?.fullPath) {
        content.value = await $fileio.readTextFromFile(currentIndexFile.fullPath)
        isContentLoaded.value = true
    }
})

const unsubscribe = on(async (event) => {
    console.log(`[Listener for ${fileName.value}]`, event)
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

onBeforeUnmount(() => {
    unsubscribe()
})

async function onRename() {
    isRenaming.value = true
    const fullPath = getFileByUuid(tabId)?.fullPath
    if (fullPath) {
        const newPath = await $fileio.renameFileOrFolder(fullPath, unref(fileName))
    }
    isRenaming.value = false;
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
                        <EditorHeaderBreadcrumbs v-model="fileName" :relative-file-path="getFileByUuid(sessionId)?.relativePath || ''" @on-rename="onRename" class="w-fit"/>
                    </div>
                </div>
            </div>
            <ScrollAreaViewport class="w-full flex-none h-full">
                <!-- This div can add padding or alignment for the editor -->
                <div class="flex flex-col items-center justify-start md:p-0 mb-16 mt-10">
                    <!-- The editor is free to be as tall as its content requires -->
                    <Editor
                        v-model="content"
                        class="max-w-2xl w-full"
                        :internal-link-map="internalLinkList"
                        @update:model-value="() => isContentSaved = false"
                        @internal-link-click="onInternalLinkClick"
                    />
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