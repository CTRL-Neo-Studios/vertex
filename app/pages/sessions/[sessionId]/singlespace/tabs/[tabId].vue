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
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {useActiveSinglespaceTools} from "~/composables/active/useActiveSinglespaceTools";

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

const editorRef = ref()
const $eu = useEditorUtils(editorRef)
const $du = useDocumentUtils()
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

function toTocEntry(entry: TocEntry) {
    $eu.scrollToNode(entry.node)
}
</script>

<template>
    <div>

    </div>
    <DashboardCenterPanel>
        <div class="w-full h-full">
            <ScrollAreaRoot
                class="w-full h-full flex flex-col relative"
                :style="{ height: 'calc(100vh - var(--ui-header-height) - 0.7rem)' }"
            >
                <div class="absolute z-10 bg-linear-to-t from-transparent via-default to-default left-0 right-0 top-0 h-10 rounded-t-xl">
                    <div class="w-full flex items-center justify-center p-2">
                        <div class="grow flex items-center justify-center">
                            <EditorHeaderBreadcrumbs :renaming="isRenaming" v-model="fileName" :relative-file-path="getFileByUuid(tabId)?.fullPath || ''" @on-rename="onRename" class="w-fit"/>
                        </div>
                    </div>
                </div>
                <ScrollAreaViewport class="w-full flex-none h-full">
                    <!-- This div can add padding or alignment for the editor -->
                    <div class="flex flex-col items-center justify-start md:p-0 mb-32 mt-10">
                        <!-- The editor is free to be as tall as its content requires -->
                        <Editor
                            ref="editorRef"
                            v-model="content"
                            class="max-w-2xl w-full"
                            :internal-link-map="internalLinkList"
                            @update:model-value="() => isContentSaved = false"
                            @internal-link-click="onInternalLinkClick"
                        />
                    </div>
                </ScrollAreaViewport>
                <div class="absolute z-10 bg-linear-to-b from-transparent to-default left-0 right-0 bottom-0 h-fit rounded-b-xl inline-flex justify-center items-center p-1">
                    <div class="grow"/>
                    <UTooltip :content="{side: 'left'}" :text="`${$du.getWordCount(content || '')} Words, ${$du.getLineCount(content || '')} Lines`" :delay-duration="100">
                        <UButton size="xs" variant="ghost" icon="i-lucide-info"/>
                    </UTooltip>
                </div>
                <ScrollAreaScrollbar
                    class="select-none touch-none z-20 w-2 m-2 pointer-events-none"
                    orientation="vertical"
                >
                    <ScrollAreaThumb
                        class="flex-1 bg-accented rounded-lg"
                    />
                </ScrollAreaScrollbar>
            </ScrollAreaRoot>
        </div>
    </DashboardCenterPanel>
    <DashboardRightPanelSidebar @to-toc="toTocEntry"/>
</template>

<style scoped>

</style>