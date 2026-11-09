<script setup lang="ts">
import type {ContextMenuItem} from "@nuxt/ui";
import {StateKey} from "#shared/constants/app";
import type {UITreeNode} from "#shared/types/active/workspace";
import FileTreeComponent from "~/components/FileTreeComponent.vue";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";

/** The Files view: the workspace's file tree, with New note/folder/workflow on right-click. */
const {t} = useI18n()
const $route = useRoute()
const $navi = useAppNavigator()
const sessionId = computed<string>(() => $route.params.sessionId as string)
const session = useActiveSessions().getSession(sessionId)
const {fileTree} = useActiveWorkspaceIndex(session)
const {openTab, activeTabUuid} = useActiveTabs(session)
// A modal per use: this view mounts whenever it's shown.
const overlay = useOverlay()

const scrollAreaRef = useTemplateRef<{ $el: HTMLElement }>('scrollAreaRef')
const {y: scrollY} = useScroll(() => scrollAreaRef.value?.$el)
const isScrolled = computed(() => scrollY.value > 2)

const activeTreeItem = useState<string>(StateKey.activeTreeItem(sessionId.value), () => '')
watch(activeTabUuid, uuid => {
    activeTreeItem.value = uuid || ''
}, {immediate: true})

async function onClickFile(item: Partial<UITreeNode>) {
    if (!item?.uuid) return
    await $navi.toWorkspaceTab(session?.uuid || '', openTab(item.uuid))
}

const newItem = (label: string, icon: string, options: { asFolder: boolean, fileExt?: string }): ContextMenuItem => ({
    label: t(label),
    icon,
    onSelect: () => void overlay.create(NewFileModal, {destroyOnClose: true}).open({modalTitle: t(label), asLevel: 'same', ...options}),
})
const contextMenuItems: ContextMenuItem[][] = [[
    newItem('app.editor.ui.filetree.newMarkdownFile', 'i-lucide-file-plus', {asFolder: false, fileExt: 'md'}),
    newItem('app.editor.ui.filetree.newFolder', 'i-lucide-folder-dot', {asFolder: true}),
    newItem('app.editor.ui.filetree.newWorkflow', 'i-lucide-workflow', {asFolder: false, fileExt: 'workflow'}),
]]
</script>

<template>
    <UContextMenu :items="contextMenuItems" size="sm">
        <UScrollArea
            ref="scrollAreaRef"
            orientation="vertical"
            :class="['no-scrollbar h-full relative scroll-fade', isScrolled && 'is-scrolled']"
            data-tauri-drag-region
        >
            <FileTreeComponent class="py-2.5" :session-id="sessionId" v-model="activeTreeItem" :nodes="fileTree" @file-click="onClickFile"/>
        </UScrollArea>
    </UContextMenu>
</template>
