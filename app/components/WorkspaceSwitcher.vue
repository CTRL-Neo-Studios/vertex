<script setup lang="ts">
import type {DropdownMenuItem} from "@nuxt/ui";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";
import {useRecents, type RecentEntry} from "~/composables/app/useRecents";
import WorkspaceBadge from "~/components/WorkspaceBadge.vue";

/**
 * The title bar's workspace switcher (JetBrains style): New Workspace…, Open…, the open workspaces (this one ticked),
 * then the recent ones. A workspace window shows its own badge and name; a singlespace window only an icon.
 */
const {t} = useI18n()
const {currentAppSession} = useAppSessions()
const $act = useAppSessionActions()
const recents = useRecents()

const root = computed(() => currentAppSession.value?.rootFileOrFolderAbsolutePath ?? '')
const isWorkspace = computed(() => currentAppSession.value?.sessionType === 'workspace' && !!root.value)

const entryItem = (entry: RecentEntry): DropdownMenuItem => ({
    label: entry.name,
    description: entry.path,
    slot: 'workspace' as const,
    entry,
    class: entry.missing ? 'opacity-50' : undefined,
    onSelect: () => void recents.open(entry),
})

const group = (label: string, list: RecentEntry[]): DropdownMenuItem[][] =>
    list.length ? [[{type: 'label', label}, ...list.map(entryItem)]] : []

const items = computed<DropdownMenuItem[][]>(() => [
    [
        {label: t('app.workspaces.new'), icon: 'i-lucide-plus', onSelect: () => void $act.newWorkspaceAction()},
        {label: t('app.workspaces.open'), icon: 'i-lucide-folder-open', onSelect: () => void $act.openWorkspaceAction()},
    ],
    ...group(t('app.workspaces.openList'), recents.workspaces.value.filter(e => e.session.open)),
    ...group(t('app.workspaces.recent'), recents.workspaces.value.filter(e => !e.session.open)),
])
const entryOf = (item: DropdownMenuItem) => item.entry as RecentEntry
</script>

<template>
    <UDropdownMenu
        :items
        size="sm"
        :content="{ align: 'start' }"
        :ui="{ content: 'w-80 max-h-[70vh]', itemDescription: 'truncate', itemLabel: 'truncate' }"
    >
        <UButton
            v-if="isWorkspace"
            color="neutral"
            variant="ghost"
            size="sm"
            trailing-icon="i-lucide-chevron-down"
            class="min-w-0"
            :title="root"
            :aria-label="$t('app.workspaces.switch')"
        >
            <WorkspaceBadge :path="root"/>
            <span class="truncate font-medium">{{ fileNameFromPath(root) }}</span>
        </UButton>
        <UButton v-else icon="i-lucide-folders" color="neutral" variant="ghost" size="sm" :title="$t('app.workspaces.switch')" :aria-label="$t('app.workspaces.switch')"/>

        <template #workspace-leading="{ item }">
            <WorkspaceBadge :path="entryOf(item).path" size="md"/>
        </template>
        <template #workspace-trailing="{ item }">
            <UIcon v-if="entryOf(item).session.uuid === currentAppSession?.uuid" name="i-lucide-check" class="size-4 shrink-0 self-center text-primary"/>
            <template v-else-if="!entryOf(item).session.open">
                <UIcon v-if="entryOf(item).session.pinned" name="i-lucide-pin" class="size-3.5 shrink-0 self-center text-muted group-hover:hidden"/>
                <UButton
                    icon="i-lucide-x"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    class="self-center opacity-0 group-hover:opacity-100 group-data-highlighted:opacity-100"
                    :aria-label="$t('app.home.removeRecent')"
                    @pointerdown.stop
                    @pointerup.stop
                    @click.stop.prevent="recents.remove(entryOf(item))"
                />
            </template>
        </template>
    </UDropdownMenu>
</template>
