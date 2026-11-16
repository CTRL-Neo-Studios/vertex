<script setup lang="ts">
import type {CommandPaletteGroup, CommandPaletteItem} from "@nuxt/ui";
import type {OverlayProps} from "#shared/plugin/api";
import {open} from "../lib/open";

/** The command palette: New items, the commands that ask for it, plugins' groups, then every file to open. */
const props = defineProps<OverlayProps>()
const {t} = useI18n()

const paletteItemFiles = computed<CommandPaletteItem[]>(() => props.session.index.files()
    .filter(file => !file.isFolder)
    .map(file => ({id: file.uuid, label: file.fileName, description: file.relativePath, onSelect: () => void props.session.tabs.open(file.uuid)})))

const paletteItemCommands = computed<CommandPaletteItem[]>(() => props.session.commands.list()
    .filter(c => c.palette)
    .map(c => ({id: c.id, label: t(c.label), icon: c.icon, disabled: c.enabled ? !c.enabled() : false, onSelect: () => void c.run()})))

/** New note, New folder, then New for each file type that offers it, at the top level. */
const paletteItemQuickActions = computed<CommandPaletteItem[]>(() => props.session.files.newItems()
    .map(item => ({label: item.label, description: item.description, icon: item.icon, onSelect: item.onSelect})))

/** Its own groups and the registered ones, by `order` (registered ones default to 50). */
const commandPaletteGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [
    {id: 'quick-actions', order: 0, label: t('plugins.palette.quickActions'), items: paletteItemQuickActions.value},
    {id: 'commands', order: 10, label: t('plugins.palette.commands'), items: paletteItemCommands.value},
    ...props.session.commands.paletteGroups().map(group => ({id: group.id, order: group.order ?? 50, label: group.label(), items: group.items()})),
    {id: 'files', order: 100, label: t('plugins.palette.files', {count: paletteItemFiles.value.length}), items: paletteItemFiles.value},
].sort((a, b) => a.order - b.order).map(({order: _, ...group}) => group))
</script>

<template>
    <UDashboardSearch v-model:open="open" shortcut="meta_p" :groups="commandPaletteGroups"/>
</template>
