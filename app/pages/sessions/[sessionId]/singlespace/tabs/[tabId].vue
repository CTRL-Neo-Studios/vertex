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
import {useActiveEditorContent} from "~/composables/active/editor/useActiveEditorContent";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import DashboardRightPanelSidebar from "~/components/LayoutComponents/DashboardRightPanelSidebar.vue";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {useActiveSinglespaceTools} from "~/composables/active/useActiveSinglespaceTools";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import type {ToTocEntryProps} from "#shared/types/active/events";
import {useActiveEditorCodeblockMappings} from "~/composables/active/editor/useActiveEditorCodeblockMappings";
import {convertFileSrc} from "@tauri-apps/api/core";
import {isDataFile, isImage, isUnreadableAsText, isVideo, isYamlFile} from "#shared/utils/fs/filenames";

definePageMeta({
    layout: 'singlespace'
})

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $fileio = useFileIO()
const sessionId = computed<string>(() => $route.params.sessionId as string), tabId = computed<string>(() => $route.params.tabId as string)
const isContentSaved = ref(true)
const isContentLoaded = ref(false), renaming = ref(false);
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
const fileExt = computed<string>(() => {
    const fn = $fileio.processFileNameFromPath(getFileByUuid(unref(tabId))?.fullPath || '', false).split('.')
    return fn[fn.length - 1] || 'unknown'
})
const fullFilePath = computed(() => getFileByUuid(unref(tabId))?.fullPath)

const showRichEditor = computed(() => {
    if (isUnreadableAsText(fileExt)) return false;
    else if (['txt', 'md'].includes(unref(fileExt))) return true;
    return false;
})
const showCodeEditor = computed(() => {
    if (isUnreadableAsText(fileExt)) return false;
    else return !['txt', 'md'].includes(unref(fileExt));
})
const showImageViewer = computed(() => isImage(fileExt))
const showVideoViewer = computed(() => isVideo(fileExt))
const showDataEditor = computed(() => isDataFile(fileExt))
const showYamlEditor = computed(() => isYamlFile(fileExt))

const internalLinkList = computed<InternalLink[]>(() => [])
const codeblockMappings = useActiveEditorCodeblockMappings()

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
        await until(renaming).toMatch(i => i == false)
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
        if (!isUnreadableAsText(fileExt))
            $fileio.readTextFromFile(currentIndexFile.fullPath).then((value) => {
                content.value = value
                isContentLoaded.value = true
            })
        else if (isImage(fileExt))
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

    renaming.value = true;

    // Revert to old value if new value is invalid or truly unchanged (case-sensitive check)
    if (fileName.value == null || INVALID_CHARS.test(fileName.value) || fileName.value === oldValue) {
        fileName.value = oldValue;
        renaming.value = false;
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

    renaming.value = false;
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
        <Suspense>
            <div class="w-full h-full relative">
                <template v-if="!isContentLoaded">
                    <div class="h-full max-h-svh w-full flex items-center justify-center">
                        <UIcon name="i-lucide-loader-circle" class="text-muted animate-spin size-6"/>
                    </div>
                </template>
                <template v-else>
                    <template v-if="showRichEditor">
                        <!--            <ContentEditor-->
                        <!--                v-model="content"-->
                        <!--                v-model:editorInstance="editorRef"-->
                        <!--                v-model:content-saved="isContentSaved"-->
                        <!--                v-model:fileName="fileName"-->

                        <!--                :specialCodeBlockMapping="codeblockMappings"-->
                        <!--                :internalLinkList="internalLinkList"-->
                        <!--                :filePath="getFileByUuid(tabId)?.relativePath"-->
                        <!--                :renaming="renaming"-->

                        <!--                @onClickedInternalLink="onInternalLinkClick"-->
                        <!--                @onRename="onRename"-->
                        <!--            />-->
                        <ViewerEditorRichText
                            v-model="content"
                            v-model:editorInstance="editorRef"
                            v-model:content-saved="isContentSaved"
                            v-model:fileName="fileName"
                            :disabled="!isContentLoaded"

                            :specialCodeBlockMapping="codeblockMappings"
                            :internalLinkList="internalLinkList"
                            :filePath="fullFilePath"
                            :renaming="renaming"

                            @onClickedInternalLink="onInternalLinkClick"
                            @onRename="onRename"
                        />
                        <MinimalLineToc @to-toc="toTocEntryWithDefaults" class="absolute right-8 top-1/2 -translate-y-1/2 z-10"/>
                    </template>
                    <template v-else-if="showImageViewer">
                        <ViewerEditorImageViewer
                            :imageSrc="convertFileSrc(fullFilePath || '')"
                            :renaming="renaming"
                            v-model:fileName="fileName"
                            :filePath="fullFilePath"
                            @onRename="onRename"
                        />
                    </template>
                    <template v-else-if="showDataEditor && showYamlEditor">
                        <ViewerEditorYamlDataForm
                            v-model="content"
                            v-model:content-saved="isContentSaved"
                            v-model:fileName="fileName"
                            :disabled="!isContentLoaded"

                            :filePath="fullFilePath"
                            :renaming="renaming"
                            @onRename="onRename"
                        />
                    </template>
                    <template v-else-if="showCodeEditor">
                        <ViewerEditorCodeText
                            v-model="content"
                            v-model:editorInstance="editorRef"
                            v-model:content-saved="isContentSaved"
                            v-model:fileName="fileName"
                            :disabled="!isContentLoaded"

                            :filePath="fullFilePath"
                            :renaming="renaming"
                            @onRename="onRename"
                        />
                    </template>
                </template>
            </div>
            <template #fallback>
                <div class="h-full max-h-svh w-full max-w-svh flex items-center justify-center">
                    <UIcon name="i-lucide-loader-circle" class="text-muted animate-spin"/>
                </div>
            </template>
        </Suspense>
    </div>
</template>

<style scoped>

</style>