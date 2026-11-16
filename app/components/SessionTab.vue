<script setup lang="ts">
import {fileUrl} from "~/utils/fileUrl"
import {readTextFile} from "@tauri-apps/plugin-fs"
import type {ViewerMountProps, ViewerProps} from "#shared/plugin/api";
import type {SessionMode} from "#shared/constants/app";
import {fileNameFromPath, getFileExtensionFromPath} from "#shared/utils/fs/filenames";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveEditorContent} from "~/composables/active/editor/useActiveEditorContent";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {SHOWN_VIEWER, viewerFor} from "~/utils/viewers";

/**
 * The editor for one open file, in either session mode. The viewer is the registered one for its extension
 * (`viewerFor`), drawn with `ViewerProps`; loading, autosave, rename and external-change handling live here once.
 */
const $route = useRoute()
const sessionId = computed(() => $route.params.sessionId as string)
const tabId = computed(() => $route.params.tabId as string)
const session = useActiveSessions().getSession(sessionId)
const mode: SessionMode = session?.workspaceSession ? 'workspace' : 'singlespace'

const $navi = useAppNavigator()
const $win = useAppWebviewWindows()
const $qt = useQuickToasts()
const {t} = useI18n()
const $index = useActiveWorkspaceIndex(session)
const $tools = useActiveWorkspaceTools(session)
const {closeTab, activeTabUuid, getActiveTab, isTabOpened, setTabSavedState, tabs} = useActiveTabs(session)
const {content} = useActiveEditorContent(session, getActiveTab(tabId))

const file = computed(() => $index.getFileByUuid(tabId.value))
const fullFilePath = computed(() => file.value?.fullPath)
const displayPath = computed(() => (mode === 'workspace' ? file.value?.relativePath : file.value?.fullPath) ?? '')
const fileExt = computed(() => getFileExtensionFromPath(fullFilePath.value ?? ''))
const viewer = computed(() => viewerFor(fileExt.value, mode))

const isContentSaved = ref(true)
const isContentLoaded = ref(false)
const renaming = ref(false)
const fileName = ref(fileNameFromPath(fullFilePath.value ?? '', true))
const INVALID_CHARS = /[\\/:*?"<>|]/

watch(isContentSaved, v => setTabSavedState(tabId, v))
provide(SHOWN_VIEWER, {viewer, status: computed(() => ({text: content.value, filePath: displayPath.value}))})

const setText = (value: string) => { content.value = value }
const viewerProps = computed((): ViewerProps | ViewerMountProps => {
    const props: ViewerProps = {
        sessionId: sessionId.value,
        fileId: tabId.value,
        filePath: displayPath.value,
        fileName: fileName.value,
        'onUpdate:fileName': value => { fileName.value = value },
        contentSaved: isContentSaved.value,
        'onUpdate:contentSaved': value => { isContentSaved.value = value },
        renaming: renaming.value,
        disabled: !isContentLoaded.value,
        assetUrl: fileUrl(fullFilePath.value ?? ''),
        onRename,
    }
    if (!viewer.value?.loadsText) return props
    return viewer.value.mount ? {...props, modelValue: content.value, setText} : {...props, modelValue: content.value, 'onUpdate:modelValue': setText}
})

async function goToTab(uuid?: string | null) {
    const tab = uuid ? getActiveTab(uuid) : undefined
    await (mode === 'workspace' ? $navi.toWorkspaceTab(sessionId, tab) : tab ? $navi.toSinglespaceTab(sessionId, tab) : $navi.toSinglespaceEmptyTab(sessionId))
}

// The file's text as this tab last read or wrote it. Loading and reloading set `content` too; only a change is written,
// so opening a file never rewrites it.
let diskText: string | undefined

debouncedWatch(content, async () => {
    if (!isContentLoaded.value || !viewer.value?.loadsText) return
    if (content.value === diskText) return void (isContentSaved.value = true)
    isContentSaved.value = false
    await until(renaming).toBe(false)
    try {
        const text = content.value
        await $tools.saveContent(tabId.value, text)
        diskText = text
        isContentSaved.value = true
    } catch (error) {
        // Keep the tab marked unsaved so the user knows; previously a failed write was silent.
        console.error('[SessionTab] autosave failed', error)
        $qt.error(t('app.editor.ui.saveFailed'), String(error))
    }
}, {debounce: 500, maxWait: 1000})

onMounted(async () => {
    if (!isTabOpened(tabId.value)) return goToTab()
    if (viewer.value?.loadsText && fullFilePath.value) content.value = diskText = await readTextFile(fullFilePath.value)
    isContentLoaded.value = true
})

const unsubscribe = $index.on(async (event) => {
    const current = fullFilePath.value
    if (event.type === 'remove') {
        if (mode === 'singlespace') return $win.getCurrentAppWindow().close()
        const removed = event.removedNodes.map(n => n.uuid)
        removed.forEach(uuid => closeTab(uuid))
        if (removed.includes(tabId.value)) await goToTab(tabs.value.length ? activeTabUuid.value : undefined)
    } else if (event.type === 'modify' && event.path === current) {
        // Changed by another program. Reload only if nothing is unsaved here, so no edits are lost.
        if (!isContentSaved.value || !viewer.value?.loadsText) return
        const fresh = await readTextFile(event.path)
        if (fresh === content.value) return
        isContentLoaded.value = false
        content.value = diskText = fresh
        await nextTick()
        isContentLoaded.value = true
    } else if (event.type === 'rename' && event.newPath === current) {
        fileName.value = fileNameFromPath(event.newPath, true)
    }
})

onBeforeUnmount(unsubscribe)

async function onRename(oldValue: string) {
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
</script>

<template>
    <div class="w-full h-full relative">
        <div v-if="!isContentLoaded" class="h-full max-h-svh w-full flex items-center justify-center">
            <UIcon name="i-lucide-loader-circle" class="text-muted animate-spin size-6"/>
        </div>
        <PluginMount v-else-if="viewer" :ui="viewer" :props="viewerProps"/>
        <div v-else class="h-full w-full flex items-center justify-center text-muted text-sm">
            {{ t('app.editor.ui.noViewer', {ext: fileExt}) }}
        </div>
    </div>
</template>
