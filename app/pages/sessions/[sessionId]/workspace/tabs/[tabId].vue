<script setup lang="ts">
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useFileIO} from "~/composables/io/useFileIO";
import {ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport, ScrollAreaRoot} from "reka-ui";
import type {
    InternalLink,
    SpecialCodeBlockMapping,
    InternalLinkClickDetail,
    TocEntry
} from "#codemirror-rich-obsidian-editor/editor-types"
import EditorHeaderBreadcrumbs from "~/components/EditorHeaderBreadcrumbs.vue";
import {useActiveEditorContent} from "~/composables/active/useActiveEditorContent";
import TabsHeaderComponent from "~/components/TabsHeaderComponent.vue";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import DashboardRightPanelSidebar from "~/components/LayoutComponents/DashboardRightPanelSidebar.vue";
import DashboardLeftPanelSidebar from "~/components/LayoutComponents/DashboardLeftPanelSidebar.vue";
import {useActiveEditorDispatcher} from "~/composables/active/useActiveEditorDispatcher";
import type {ToTocEntryProps} from "#shared/types/active/events";

definePageMeta({
    layout: 'workspace'
})

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $fileio = useFileIO()
const sessionId = computed<string>(() => $route.params.sessionId as string), tabId = computed<string>(() => $route.params.tabId as string)
const isContentSaved = ref(true)
const isContentLoaded = ref(false), isRenaming = ref(false);
const {
    on,
    getFileByUuid,
    moveFileInIndex,
    fileIndex,
    updateIndex
} = useActiveWorkspaceIndex($sesh.getSession(sessionId))
const {
    closeTab,
    activeTabUuid,
    getActiveTab,
    isTabOpened,
    setTabSavedState,
    openTab,
    tabs
} = useActiveTabs($sesh.getSession(sessionId))
const {content} = useActiveEditorContent($sesh.getSession(sessionId), getActiveTab(tabId))
const {dispatcher: editorDispatcher} = useActiveEditorDispatcher($sesh.getSession(sessionId))

const editorRef = ref()
const $eu = useEditorUtils(editorRef)
const $du = useDocumentUtils()
const cachedFileIndex = getFileByUuid(unref(tabId))
const INVALID_CHARS = /[\\/:*?"<>|]/;

const fileName = ref<string>($fileio.processFileNameFromPath(getFileByUuid(unref(tabId))?.fullPath || '', true))
const internalLinkList = computed<InternalLink[]>(() => {
    const list: InternalLink[] = []
    for (const path in unref(fileIndex)) {
        const f = unref(fileIndex)[path]
        if (!f) continue;
        const fn = f.fileName
        if (!fn) continue;
        if (f.isFolder) continue;

        list.push({
            name: $fileio.processFileNameFromPath(fn, true),
            filePath: f.relativePath,
            referenceId: f.uuid
        } satisfies InternalLink)
    }

    return list
})

async function onInternalLinkClick(args: InternalLinkClickDetail) {
    const {referenceId} = args
    if (referenceId) {
        const tab = openTab(referenceId)
        await $navi.toWorkspaceTab(sessionId, tab)
    }
}

watch(isContentSaved, (newValue) => {
    setTabSavedState(tabId, newValue)
}, {deep: false})

// watch(fileIndex, () => {
//     console.log('File Index Changed')
// }, { deep: true })

debouncedWatch(content, async () => {
    if (!isContentLoaded.value) return;

    isContentSaved.value = false;

    try {
        await until(isRenaming).toMatch(i => i == false)
        // await $fileio.writeTextToFile(getFileByUuid(tabId)?.fullPath, content.value);
        const fp = getFileByUuid(tabId)?.fullPath
        if (fp)
            Promise.all([
                $fileio.writeTextToFile(fp, unref(content)),
                updateIndex(fp, unref(content))
            ]).then(() => {
                isContentSaved.value = true
            });
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
    if (event.type == "remove") {
        if (event.path == cachedFileIndex?.fullPath) {
            closeTab(tabId)
            if (unref(tabs)?.length == 0)
                await $navi.toWorkspaceEmptyTab(sessionId)
            else
                await $navi.toWorkspaceTab(sessionId, getActiveTab(activeTabUuid))
        } else {
            event.removedNodes.forEach(i => closeTab(i.uuid))
        }
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
    editorDispatcher.unmount()
    unsubscribe()
})

async function onRename(oldValue: string) {
    isRenaming.value = true;

    // Revert to old value if new value is invalid or truly unchanged (case-sensitive check)
    if (fileName.value == null || INVALID_CHARS.test(fileName.value) || fileName.value === oldValue) {
        fileName.value = oldValue;
        isRenaming.value = false;
        return;
    }

    const fileToRename = getFileByUuid(tabId);
    const workspaceRoot = $sesh.getSession(sessionId)?.rootPath;

    if (fileToRename?.fullPath && workspaceRoot) {
        try {
            // 1. Perform the rename on the file system
            const newPath = await $fileio.renameFileOrFolder(fileToRename.fullPath, unref(fileName));

            if (newPath) {
                // 2. Proactively update the in-memory index to prevent desync from watcher lag
                console.log(`Proactively moving index from ${fileToRename.fullPath} to ${newPath}`);
                await moveFileInIndex(fileToRename.fullPath, newPath, workspaceRoot);
            }
        } catch (error) {
            console.error("Failed to rename file or update index:", error);
            // Revert the filename in the UI if the operation fails
            fileName.value = oldValue;
        }
    }

    isRenaming.value = false;
}

function toTocEntry(props: ToTocEntryProps) {
    $eu.scrollToNode(props.node.node, props.verticalScrollStrategy, props.verticalMargin)
}

function toTocEntryWithDefaults(node: TocEntry) {
    $eu.scrollToNode(node.node, 'start', 70)
}

editorDispatcher.on('editor.tableOfContents.toEntry', (props) => {
    toTocEntry(props)
})

</script>

<template>
    <div class="w-full h-full relative">
        <ContentEditor
            v-model="content"
            v-model:editorInstance="editorRef"
            v-model:content-saved="isContentSaved"
            v-model:fileName="fileName"

            :internalLinkList
            :filePath="getFileByUuid(tabId)?.relativePath"
            :renaming="isRenaming"

            @onClickedInternalLink="onInternalLinkClick"
            @onRename="onRename"
        />
        <MinimalLineToc @to-toc="toTocEntryWithDefaults" class="absolute right-8 top-1/2 -translate-y-1/2 z-10"/>
    </div>
</template>

<style scoped>

</style>