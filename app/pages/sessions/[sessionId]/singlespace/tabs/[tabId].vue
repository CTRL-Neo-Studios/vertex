<script setup lang="ts">
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useFileIO} from "~/composables/io/useFileIO";
import type {
    InternalLink,
    SpecialCodeBlockMapping,
    InternalLinkClickDetail,
    TocEntry
} from "#codemirror-rich-obsidian-editor/editor-types"
import {useActiveEditorContent} from "~/composables/active/useActiveEditorContent";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import DashboardRightPanelSidebar from "~/components/LayoutComponents/DashboardRightPanelSidebar.vue";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {useActiveSinglespaceTools} from "~/composables/active/useActiveSinglespaceTools";
import {useActiveEditorDispatcher} from "~/composables/active/useActiveEditorDispatcher";
import type {ToTocEntryProps} from "#shared/types/active/events";

definePageMeta({
    layout: 'singlespace'
})

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $fileio = useFileIO()
const sessionId = computed<string>(() => $route.params.sessionId as string), tabId = computed<string>(() => $route.params.tabId as string)
const isContentSaved = ref(true)
const isContentLoaded = ref(false), isRenaming = ref(false);
const {
    initializeIndex,
    removeFileFromIndex,
    getFileByUuid,
    updateIndex,
    moveFileInIndex,
    isIndexTemporary,
    setTemporaryIndex,
} = useActiveSinglespaceIndex($sesh.getSession(sessionId))
const {
    closeTab,
    activeTabUuid,
    getActiveTab,
    isTabOpened,
    setTabSavedState,
    openTab,
    tabs
} = useActiveTabs($sesh.getSession(sessionId))
const {
    saveTemporaryFile
} = useActiveSinglespaceTools($sesh.getSession(sessionId))
const {content} = useActiveEditorContent($sesh.getSession(sessionId), getActiveTab(tabId))
const {dispatcher: editorDispatcher} = useActiveEditorDispatcher($sesh.getSession(sessionId))

const editorRef = ref()
const $eu = useEditorUtils(editorRef)
const INVALID_CHARS = /[\\/:*?"<>|]/;

const fileName = ref<string>($fileio.processFileNameFromPath(getFileByUuid(unref(tabId))?.fullPath || '', true))
const internalLinkList = computed<InternalLink[]>(() => [])

async function onInternalLinkClick(args: InternalLinkClickDetail) {
    // Do nothing
}

defineShortcuts({
    'meta_s': {
        usingInput: true,
        async handler(e) {
            isContentSaved.value = false;
            const newIndex = await saveTemporaryFile(tabId, content)
            fileName.value = newIndex?.fileName || 'Untitled.md'
            isContentSaved.value = true;
        }
    }
})

watch(isContentSaved, (newValue) => {
    setTabSavedState(tabId, newValue)
}, {deep: false})

debouncedWatch(content, async () => {
    if (!isContentLoaded.value || isIndexTemporary(tabId)) return;

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
        await $navi.toSinglespaceEmptyTab(unref(sessionId))

    const currentIndexFile = getFileByUuid(tabId)
    if (currentIndexFile && currentIndexFile?.fullPath && !isIndexTemporary(currentIndexFile?.uuid)) {
        content.value = await $fileio.readTextFromFile(currentIndexFile.fullPath)
        isContentLoaded.value = true
    } else {
        isContentSaved.value = false
        isContentLoaded.value = true
    }
})

onBeforeUnmount(async () => {
    editorDispatcher.unmount()
})

async function onRename(oldValue: string) {
    if (isIndexTemporary(tabId)) return;

    isRenaming.value = true;

    // Revert to old value if new value is invalid or truly unchanged (case-sensitive check)
    if (fileName.value == null || INVALID_CHARS.test(fileName.value) || fileName.value === oldValue) {
        fileName.value = oldValue;
        isRenaming.value = false;
        return;
    }

    const fileToRename = getFileByUuid(tabId);
    const singlespaceRoot = $sesh.getSession(sessionId)?.rootPath;

    if (fileToRename?.fullPath && singlespaceRoot) {
        try {
            // 1. Perform the rename on the file system
            const newPath = await $fileio.renameFileOrFolder(fileToRename.fullPath, unref(fileName));

            if (newPath) {
                // 2. Proactively update the in-memory index to prevent desync from watcher lag
                console.log(`Proactively moving index from ${fileToRename.fullPath} to ${newPath}`);
                await moveFileInIndex(fileToRename.fullPath, newPath, singlespaceRoot);
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
            :filePath="getFileByUuid(tabId)?.fullPath"
            :renaming="isRenaming"

            @onClickedInternalLink="onInternalLinkClick"
            @onRename="onRename"
        />
        <MinimalLineToc @to-toc="toTocEntryWithDefaults" class="absolute right-8 top-1/2 -translate-y-1/2 z-10"/>
    </div>
</template>

<style scoped>

</style>