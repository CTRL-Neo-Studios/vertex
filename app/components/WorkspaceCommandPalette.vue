<script setup lang="ts">
import type {CommandPaletteGroup, CommandPaletteItem} from "@nuxt/ui";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import type {UITreeNode} from "#shared/types/active/workspace";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import {StateKey} from "#shared/constants/app";
import {registeredCommands} from "~/utils/commands";
import {fileTypes, paletteGroups} from "~/utils/contributions";

const { t } = useI18n()

const $route = useRoute()
const $ovl = useOverlay()
const sessionId = computed<string>(() => $route.params.sessionId as string)
const $sesh = useActiveSessions()
const $navi = useAppNavigator()
const {
    fileIndex,
} = useActiveWorkspaceIndex($sesh.getSession(sessionId))
const {
    openTab,
} = useActiveTabs($sesh.getSession(sessionId))
const newFileModal = $ovl.create(NewFileModal)
// Shared so the left sidebar's Search item can open it.
const open = useState<boolean>(StateKey.fileSearchOpen(sessionId.value), () => false)

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

// Plugins' commands that ask for the palette.
const paletteItemCommands = computed<CommandPaletteItem[]>(() => [...registeredCommands.values()]
    .filter(c => c.palette)
    .map(c => ({id: c.id, label: t(c.label), icon: c.icon, disabled: c.enabled ? !c.enabled() : false, onSelect: () => void c.run()})))

/** New Markdown File, New Folder, then New for each file type that offers it. */
const paletteItemQuickActions = computed<CommandPaletteItem[]>(() => [
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
    ...[...fileTypes.items.values()].filter(type => type.new).map(type => ({
        label: t(type.new!.label),
        description: type.new!.description && t(type.new!.description),
        icon: type.icon,
        onSelect() {
            newFileModal.open({
                modalTitle: t(type.new!.label),
                asFolder: false,
                asLevel: 'same',
                fileExt: type.extensions[0]
            })
        }
    })),
])

/** The kernel's groups and the registered ones, by `order` (registered ones default to 50). */
const commandPaletteGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [
    {
        id: 'quick-actions',
        order: 0,
        label: t('app.editor.ui.palette.quickActions'),
        items: paletteItemQuickActions.value,
    },
    {
        id: 'commands',
        order: 10,
        label: t('app.editor.ui.palette.commands'),
        items: paletteItemCommands.value,
    },
    ...[...paletteGroups.items.values()].map(group => ({id: group.id, order: group.order ?? 50, label: group.label(), items: group.items()})),
    {
        id: 'files',
        order: 100,
        label: t('app.editor.ui.palette.files', {count: unref(paletteItemFiles).length}),
        items: unref(paletteItemFiles),
    }
].sort((a, b) => a.order - b.order).map(({order: _, ...group}) => group))
</script>

<template>
    <UDashboardSearch v-model:open="open" shortcut="meta_p" :groups="commandPaletteGroups"/>
</template>

<style scoped>

</style>
