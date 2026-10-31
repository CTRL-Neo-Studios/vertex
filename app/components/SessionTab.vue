<script setup lang="ts">
import {convertFileSrc} from "@tauri-apps/api/core"
import type {InternalLink, InternalLinkClickDetail, TocEntry} from "#codemirror-rich-obsidian-editor/editor-types"
import type {ToTocEntryProps} from "#shared/types/active/events";
import type {SessionMode} from "#shared/constants/app";
import {getFileExtensionFromPath, isImage, isPlainTextFile} from "#shared/utils/fs/filenames";
import {EditorProseEmbedImageDisplay} from "#components";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveEditorContent} from "~/composables/active/editor/useActiveEditorContent";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import {useActiveEditorCodeblockMappings} from "~/composables/active/editor/useActiveEditorCodeblockMappings";
import {useActiveFileTools} from "~/composables/active/useActiveFileTools";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useFileIO} from "~/composables/io/useFileIO";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {viewerFor} from "~/utils/viewers";
import {viewerComponents} from "~/utils/viewerComponents";

/**
 * The editor for one open file, in either session mode. The viewer is chosen by extension from
 * `app/utils/viewers.ts`; loading, autosave, rename and external-change handling live here once.
 */
const $route = useRoute()
const sessionId = computed(() => $route.params.sessionId as string)
const tabId = computed(() => $route.params.tabId as string)
const session = useActiveSessions().getSession(sessionId)
const mode: SessionMode = session?.workspaceSession ? 'workspace' : 'singlespace'

const $navi = useAppNavigator()
const $win = useAppWebviewWindows()
const $fileio = useFileIO()
const $qt = useQuickToasts()
const {t} = useI18n()
const $tools = useActiveFileTools(session)
const {closeTab, activeTabUuid, getActiveTab, isTabOpened, setTabSavedState, openTab, tabs} = useActiveTabs(session)
const {content} = useActiveEditorContent(session, getActiveTab(tabId))
const {dispatcher: editorDispatcher} = useActiveEditorDispatcher(session)
const codeblockMappings = useActiveEditorCodeblockMappings()

const file = computed(() => $tools.getFileByUuid(tabId.value))
const fullFilePath = computed(() => file.value?.fullPath)
const displayPath = computed(() => mode === 'workspace' ? $tools.relativePathOf(file.value) : file.value?.fullPath)
const fileExt = computed(() => getFileExtensionFromPath(fullFilePath.value ?? ''))
const viewer = computed(() => viewerFor(fileExt.value, mode))
const viewerComponent = computed(() => viewer.value ? viewerComponents[viewer.value.id] : undefined)

const isContentSaved = ref(true)
const isContentLoaded = ref(false)
const renaming = ref(false)
const fileName = ref($fileio.processFileNameFromPath(fullFilePath.value ?? '', true))
const editorRef = ref()
const $eu = useEditorUtils(editorRef)
const INVALID_CHARS = /[\\/:*?"<>|]/

watch(isContentSaved, v => setTabSavedState(tabId, v))

const internalLinkList = computed<InternalLink[]>(() => {
    if (mode !== 'workspace') return []
    return $tools.linkableFiles().flatMap(f => {
        const ext = getFileExtensionFromPath(f.fileName)
        const name = $fileio.processFileNameFromPath(f.fullPath, true)
        if (isPlainTextFile(ext)) return [{name, filePath: f.relativePath, referenceId: f.uuid} satisfies InternalLink]
        if (isImage(ext)) return [{
            name, filePath: f.relativePath, referenceId: f.uuid,
            embedComponent: EditorProseEmbedImageDisplay,
            componentProps: {srcPath: convertFileSrc(f.fullPath), display: name},
        } satisfies InternalLink]
        return []
    })
})

/** Inputs specific to the active viewer, from its `extras` in the registry, plus the text model when it loads text. */
const viewerProps = computed(() => {
    const v = viewer.value
    if (!v) return {}
    const props: Record<string, unknown> = {}
    if (v.loadsText) {
        props.modelValue = content.value
        props['onUpdate:modelValue'] = (value: string) => { content.value = value }
    }
    for (const extra of v.extras) {
        if (extra === 'editorInstance') {
            props.editorInstance = editorRef.value
            props['onUpdate:editorInstance'] = (value: unknown) => { editorRef.value = value }
        }
        else if (extra === 'internalLinks') props.internalLinkList = internalLinkList.value
        else if (extra === 'codeBlocks') props.specialCodeBlockMapping = codeblockMappings
        else if (extra === 'sessionId') props.sessionId = sessionId.value
        else if (extra === 'imageSrc') props.imageSrc = convertFileSrc(fullFilePath.value ?? '')
    }
    return props
})

async function goToTab(uuid?: string | null) {
    const tab = uuid ? getActiveTab(uuid) : undefined
    await (mode === 'workspace' ? $navi.toWorkspaceTab(sessionId, tab) : tab ? $navi.toSinglespaceTab(sessionId, tab) : $navi.toSinglespaceEmptyTab(sessionId))
}

async function onInternalLinkClick({referenceId}: InternalLinkClickDetail) {
    if (mode === 'workspace' && referenceId) await goToTab(openTab(referenceId).fileUuid)
}

debouncedWatch(content, async () => {
    if (!isContentLoaded.value || !viewer.value?.loadsText || $tools.isTemporary(tabId.value)) return
    isContentSaved.value = false
    await until(renaming).toBe(false)
    try {
        await $tools.saveContent(tabId.value, content.value)
        isContentSaved.value = true
    } catch (error) {
        // Keep the tab marked unsaved so the user knows; previously a failed write was silent.
        console.error('[SessionTab] autosave failed', error)
        $qt.error(t('app.editor.ui.saveFailed'), String(error))
    }
}, {debounce: 500, maxWait: 1000})

onMounted(async () => {
    if (!isTabOpened(tabId.value)) return goToTab()
    if ($tools.isTemporary(tabId.value)) {
        isContentSaved.value = false
        isContentLoaded.value = true
        return
    }
    if (viewer.value?.loadsText && fullFilePath.value) content.value = await $fileio.readTextFromFile(fullFilePath.value)
    isContentLoaded.value = true
})

const unsubscribe = $tools.on(async (event) => {
    const current = fullFilePath.value
    if (event.type === 'remove') {
        if (mode === 'singlespace') return $win.getCurrentAppWindow().close()
        const removed = event.removedNodes.map(n => n.uuid)
        removed.forEach(uuid => closeTab(uuid))
        if (removed.includes(tabId.value)) await goToTab(tabs.value.length ? activeTabUuid.value : undefined)
    } else if (event.type === 'modify' && event.path === current) {
        // Changed by another program. Reload only if nothing is unsaved here, so no edits are lost.
        if (!isContentSaved.value || !viewer.value?.loadsText) return
        const fresh = await $fileio.readTextFromFile(event.path)
        if (fresh === content.value) return
        isContentLoaded.value = false
        content.value = fresh
        await nextTick()
        isContentLoaded.value = true
    } else if (event.type === 'rename' && event.newPath === current) {
        fileName.value = $fileio.processFileNameFromPath(event.newPath, true)
    }
})

onBeforeUnmount(() => {
    editorDispatcher.unmount()
    unsubscribe()
})

async function onRename(oldValue: string) {
    if ($tools.isTemporary(tabId.value)) return
    if (!fileName.value || INVALID_CHARS.test(fileName.value) || fileName.value === oldValue) {
        fileName.value = oldValue
        return
    }
    renaming.value = true
    try {
        await $tools.renameFile(tabId.value, fileName.value)
    } catch (error) {
        console.error('[SessionTab] rename failed', error)
        $qt.error(t('app.generic.ui.renameFailed'), String(error))
        fileName.value = oldValue
    } finally {
        renaming.value = false
    }
}

function toTocEntry(props: ToTocEntryProps) {
    $eu.scrollToNode(props.node.node, props.verticalScrollStrategy, props.verticalMargin)
}

editorDispatcher.on('editor.tableOfContents.toEntry', toTocEntry)
</script>

<template>
    <div class="w-full h-full relative">
        <div v-if="!isContentLoaded" class="h-full max-h-svh w-full flex items-center justify-center">
            <UIcon name="i-lucide-loader-circle" class="text-muted animate-spin size-6"/>
        </div>
        <template v-else-if="viewerComponent">
            <component
                :is="viewerComponent"
                v-bind="viewerProps"
                v-model:content-saved="isContentSaved"
                v-model:fileName="fileName"
                :disabled="!isContentLoaded"
                :filePath="displayPath"
                :renaming="renaming"
                @onClickedInternalLink="onInternalLinkClick"
                @onRename="onRename"
            />
            <MinimalLineToc
                v-if="viewer?.id === 'markdown'"
                class="absolute right-8 top-1/2 -translate-y-1/2 z-10"
                @to-toc="(node: TocEntry) => $eu.scrollToNode(node.node, 'start', 70)"
            />
        </template>
        <div v-else class="h-full w-full flex items-center justify-center text-muted text-sm">
            {{ t('app.editor.ui.noViewer', {ext: fileExt}) }}
        </div>
    </div>
</template>
