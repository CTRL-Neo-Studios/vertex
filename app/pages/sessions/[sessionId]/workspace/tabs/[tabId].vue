<script setup lang="ts">
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useFileIO} from "~/composables/io/useFileIO";
import {convertFileSrc} from "@tauri-apps/api/core"
import type {InternalLink, InternalLinkClickDetail, TocEntry} from "#codemirror-rich-obsidian-editor/editor-types"
import {useActiveEditorContent} from "~/composables/active/editor/useActiveEditorContent";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import type {ToTocEntryProps} from "#shared/types/active/events";
import {
    getFileExtensionFromPath,
    isDataFile,
    isImage,
    isUnreadableAsText,
    isPdf,
    isTextFile,
    isVideo
} from "#shared/utils/fs/filenames";
import {EditorProseEmbedImageDisplay} from "#components";
import {useActiveEditorCodeblockMappings} from "~/composables/active/editor/useActiveEditorCodeblockMappings";
import TextCodeEditor from "~/components/TextCodeEditor.vue";

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
const fileExt = computed<string>(() => {
    const fn = $fileio.processFileNameFromPath(getFileByUuid(unref(tabId))?.fullPath || '', false).split('.')
    return fn[fn.length - 1] || 'unknown'
})

const showRichEditor = computed(() => {
    if (isUnreadableAsText(fileExt)) return false;
    else if (['txt', 'md'].includes(unref(fileExt))) return true;
    return false;
})
const showCodeEditor = computed(() => {
    if (isUnreadableAsText(fileExt)) return false;
    else return !['txt', 'md'].includes(unref(fileExt));
})
const showImageViewer = computed(() => {
    return isImage(fileExt);
})
const showVideoViewer = computed(() => {
    return isVideo(fileExt)
})
const showDataEditor = computed(() => {
    return isDataFile(fileExt)
})

const internalLinkList = computed<InternalLink[]>(() => {
    const list: InternalLink[] = []
    for (const path in unref(fileIndex)) {
        const file = unref(fileIndex)[path]
        if (!file) continue;
        const filename = $fileio.processFileNameFromPath(file.fullPath, false)
        if (!filename) continue;
        if (file.isFolder) continue;

        const fext = getFileExtensionFromPath(filename)
        const noExtFilename = $fileio.processFileNameFromPath(file.fullPath, true)

        if (isTextFile(fext))
            list.push({
                name: noExtFilename,
                filePath: file.relativePath,
                referenceId: file.uuid
            } satisfies InternalLink)
        else if (isImage(fext))
            list.push({
                name: noExtFilename,
                filePath: file.relativePath,
                referenceId: file.uuid,
                embedComponent: EditorProseEmbedImageDisplay,
                componentProps: {
                    filePath: convertFileSrc(file.fullPath),
                    display: noExtFilename
                }
            } satisfies InternalLink)
    }

    return list
})
const codeblockMappings = useActiveEditorCodeblockMappings()

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
        <template v-if="showRichEditor">
            <ContentEditor
                v-model="content"
                v-model:editorInstance="editorRef"
                v-model:content-saved="isContentSaved"
                v-model:fileName="fileName"

                :specialCodeBlockMapping="codeblockMappings"
                :internalLinkList="internalLinkList"
                :filePath="getFileByUuid(tabId)?.relativePath"
                :renaming="isRenaming"

                @onClickedInternalLink="onInternalLinkClick"
                @onRename="onRename"
            />
            <MinimalLineToc @to-toc="toTocEntryWithDefaults" class="absolute right-8 top-1/2 -translate-y-1/2 z-10"/>
        </template>
        <template v-else-if="showImageViewer">
            <div class="w-full h-full max-h-svh max-w-svw flex items-center justify-center overflow-hidden" v-if="isImage(fileExt)">
                <img
                    :src="convertFileSrc(getFileByUuid(tabId)?.fullPath || '')"
                    class="max-w-full max-h-full object-contain"
                    alt="image"
                />
            </div>
        </template>
        <template v-else-if="showCodeEditor">
            <TextCodeEditor
                v-model="content"
                v-model:editorInstance="editorRef"
                v-model:content-saved="isContentSaved"
                v-model:fileName="fileName"

                :filePath="getFileByUuid(tabId)?.relativePath"
                :renaming="isRenaming"
                @onRename="onRename"
            />
        </template>
    </div>
</template>

<style scoped>

</style>