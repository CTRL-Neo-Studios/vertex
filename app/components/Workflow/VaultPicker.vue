<script setup lang="ts">
import type {TreeItem} from "@nuxt/ui"
import type {UITreeNode} from "#shared/types/active/workspace"
import {extensionOf} from "#shared/workflows/vault"
import {useActiveSessions} from "~/composables/active/useActiveSessions"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex"

/**
 * The vault as a tree to pick from: files, folders or either, one or several, optionally only some extensions
 * (comma-separated). Searching lists matches flat. The model is vault-relative paths (`''` = the vault root).
 */
const props = withDefaults(defineProps<{
    sessionId: string,
    kind?: 'file' | 'folder' | 'any',
    multiple?: boolean,
    extensions?: string,
}>(), {kind: 'any', multiple: false, extensions: ''})
const model = defineModel<string[]>({default: () => []})
const {t} = useI18n()
const {fileTree} = useActiveWorkspaceIndex(useActiveSessions().getSession(props.sessionId))

const query = ref('')
const expanded = ref<string[]>([])
const wanted = computed(() => props.extensions.split(/[\s,]+/).map(e => e.replace(/^\./, '').toLowerCase()).filter(Boolean))
const pickable = (node: UITreeNode) => props.kind === 'any' || (props.kind === 'folder') === node.isFolder
// Folders always show, so files inside them can be reached.
const shown = (node: UITreeNode) => node.isFolder || (props.kind !== 'folder' && (!wanted.value.length || wanted.value.includes(extensionOf(node.relativePath).toLowerCase())))

function toggle(path: string) {
    if (!props.multiple) model.value = [path]
    else model.value = model.value.includes(path) ? model.value.filter(p => p !== path) : [...model.value, path]
}

const item = (path: string, label: string, isFolder: boolean, canPick: boolean, children?: TreeItem[]): TreeItem => ({
    id: `p:${path}`,
    path,
    label,
    icon: isFolder ? undefined : 'i-lucide-file',
    children,
    onSelect(e: Event) {
        e.preventDefault()
        if (canPick) toggle(path)
    },
})

const items = computed<TreeItem[]>(() => {
    const q = query.value.trim().toLowerCase()
    if (q) {
        const found: TreeItem[] = []
        const walk = (nodes: UITreeNode[]) => nodes.forEach(n => {
            if (shown(n) && pickable(n) && n.fileName.toLowerCase().includes(q)) found.push(item(n.relativePath, n.relativePath, n.isFolder, true))
            if (n.isFolder) walk(n.children)
        })
        walk(fileTree.value)
        return found
    }
    const build = (nodes: UITreeNode[]): TreeItem[] => nodes.filter(shown).map(n =>
        item(n.relativePath, n.fileName, n.isFolder, pickable(n), n.isFolder ? build(n.children) : undefined))
    const tree = build(fileTree.value)
    return props.kind === 'folder' ? [item('', t('app.editor.ui.vaultPicker.root'), true, true), ...tree] : tree
})
</script>

<template>
    <div class="flex flex-col gap-2">
        <UInput v-model="query" icon="i-lucide-search" size="sm" :placeholder="t('app.editor.ui.vaultPicker.search')" autofocus/>
        <div class="max-h-72 overflow-y-auto">
            <UTree v-model:expanded="expanded" :items="items" :get-key="(i: TreeItem) => i.id as string" size="sm">
                <template #item-trailing="{item: i}">
                    <UIcon v-if="model.includes(i.path)" name="i-lucide-check" class="size-4 shrink-0 text-primary"/>
                </template>
            </UTree>
            <p v-if="!items.length" class="p-2 text-sm text-muted">{{ t('app.editor.ui.vaultPicker.nothing') }}</p>
        </div>
    </div>
</template>
