<script setup lang="ts">
import type {CommandPaletteGroup, CommandPaletteItem} from "@nuxt/ui";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import type {UITreeNode} from "#shared/types/active/workspace";
import {fileNameFromPath, getFileExtensionFromPath, isWorkflowFile} from "#shared/utils/fs/filenames";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useWorkflowRunner} from "~/composables/workflows/useWorkflowRunner";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import {StateKey} from "#shared/constants/app";
import {useBaseCommandItems} from "~/composables/bases/useBaseCommands";

const { t } = useI18n()

const $route = useRoute()
const $ovl = useOverlay()
const sessionId = computed<string>(() => $route.params.sessionId as string)
const $sesh = useActiveSessions()
const $navi = useAppNavigator()
const {
    fileIndex,
    getFileByUuid,
} = useActiveWorkspaceIndex($sesh.getSession(sessionId))
const {
    openTab,
    activeTabUuid,
} = useActiveTabs($sesh.getSession(sessionId))
const newFileModal = $ovl.create(NewFileModal)
const session = $sesh.getSession(sessionId)
const runner = session?.rootPath ? useWorkflowRunner(session) : undefined
// Shared so the left sidebar's Search item can open it.
const open = useState<boolean>(StateKey.fileSearchOpen(sessionId.value), () => false)
// The open base's commands, while one is open.
const baseCommands = useBaseCommandItems()

async function onClickFile(item: Partial<UITreeNode>) {
    if (!item || !item.uuid) return;
    const tab = openTab(item.uuid)
    await $navi.toWorkspaceTab($sesh.getSession(sessionId)?.uuid || '', tab)
}

const paletteItemFiles = computed(() => {
    const items: CommandPaletteItem[] = []
    for (const path in unref(fileIndex)) {
        const item = unref(fileIndex)[path]
        if (item && !item.isFolder)
            items.push({
                id: item.uuid,
                label: item.fileName,
                description: item.relativePath,
                async onSelect() {
                    await onClickFile({
                        uuid: item.uuid
                    })
                }
            })
    }
    return items
})

// Each workflow, run on the open note when there is one (for Current note).
const paletteItemWorkflows = computed<CommandPaletteItem[]>(() => {
    if (!runner) return []
    const active = getFileByUuid(activeTabUuid.value ?? undefined)
    const note = active && getFileExtensionFromPath(active.fileName) === 'md' ? active.relativePath : undefined
    return Object.values(unref(fileIndex))
        .filter(f => !f.isFolder && isWorkflowFile(getFileExtensionFromPath(f.fileName)))
        .map(f => ({
            id: `run:${f.uuid}`,
            label: t('app.editor.ui.palette.runWorkflow', {name: fileNameFromPath(f.fileName, true)}),
            description: note ? t('app.editor.ui.palette.runWorkflowOn', {note}) : f.relativePath,
            icon: 'i-lucide-play',
            onSelect: () => runner.runFile(f.relativePath, false, {note}),
        }))
})

const commandPaletteGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [
    {
        id: 'quick-actions',
        label: t('app.editor.ui.palette.quickActions'),
        items: [
            {
                label: t('app.editor.ui.filetree.newMarkdownFile'),
                description: t('app.editor.ui.palette.newFileDescription'),
                icon: 'i-lucide-file-plus',
                onSelect() {
                    newFileModal.open({
                        modalTitle: t('app.editor.ui.filetree.newMarkdownFile'),
                        asFolder: false,
                        asLevel: 'same',
                        fileExt: 'md'
                    })
                }
            },
            {
                label: t('app.editor.ui.filetree.newFolder'),
                description: t('app.editor.ui.palette.newFolderDescription'),
                icon: 'i-lucide-folder-dot',
                onSelect() {
                    newFileModal.open({
                        modalTitle: t('app.editor.ui.filetree.newFolder'),
                        asFolder: true,
                        asLevel: 'same'
                    })
                }
            },
            {
                label: t('app.editor.ui.filetree.newCanvas'),
                description: t('app.editor.ui.palette.newCanvasDescription'),
                icon: 'i-lucide-layout-dashboard',
                onSelect() {
                    newFileModal.open({
                        modalTitle: t('app.editor.ui.filetree.newCanvas'),
                        asFolder: false,
                        asLevel: 'same',
                        fileExt: 'canvas'
                    })
                }
            },
            {
                label: t('app.editor.ui.filetree.newWorkflow'),
                description: t('app.editor.ui.palette.newWorkflowDescription'),
                icon: 'i-lucide-workflow',
                onSelect() {
                    newFileModal.open({
                        modalTitle: t('app.editor.ui.filetree.newWorkflow'),
                        asFolder: false,
                        asLevel: 'same',
                        fileExt: 'workflow'
                    })
                }
            }
        ]
    },
    {
        id: 'bases',
        label: t('app.editor.ui.bases.commands.group'),
        items: baseCommands.value,
    },
    {
        id: 'workflows',
        label: t('app.editor.ui.palette.workflows'),
        items: unref(paletteItemWorkflows),
    },
    {
        id: 'files',
        label: t('app.editor.ui.palette.files', {count: unref(paletteItemFiles).length}),
        items: unref(paletteItemFiles),
    }
])
</script>

<template>
    <UDashboardSearch v-model:open="open" shortcut="meta_p" :groups="commandPaletteGroups"/>
</template>

<style scoped>

</style>