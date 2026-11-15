<script setup lang="ts">
import {convertFileSrc} from "@tauri-apps/api/core";
import {toDisplay, toText, type RowScope, type Value} from "@type32/obsidian-bases-parser";
import {filterXSS} from "xss";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useBaseContext} from "~/composables/bases/useBaseContext";

/**
 * A row's property as Bases renders it (table cells, cards, lists): links open their note, URLs the browser; tags and
 * note lists are pills; checkboxes (toggling only when `editable`); dates, durations, numbers as text; sanitized HTML;
 * images; icons; errors with their message. Null renders nothing. `oneLine` clips instead of wrapping.
 */
const props = withDefaults(defineProps<{ row: RowScope, id: string, oneLine?: boolean, editable?: boolean }>(), {oneLine: true, editable: false})
const emit = defineEmits<{ toggle: [checked: boolean] }>()
const ctx = useBaseContext()
const {getFileByPath} = useActiveWorkspaceIndex(ctx.session)
const {openTab} = useActiveTabs(ctx.session)
const $navi = useAppNavigator()
const {openUrlInBrowser} = useAppOpener()

const property = computed(() => ctx.property(props.id))
const value = computed(() => props.row.property(props.id))

async function openNote(path: string | null) {
    if (!path) return
    const node = getFileByPath(`${ctx.session.rootPath}/${path}`)
    if (node) await $navi.toWorkspaceTab(ctx.session.uuid, openTab(node.uuid))
}

interface ValueLink { label: string, path: string | null }
function linkOf(v: Value): ValueLink | null {
    if (v.type === 'Link') return {label: v.display ?? v.path, path: ctx.host.resolve(v.path.split('#')[0]!, v.from)}
    if (v.type === 'File') return {label: v.path.split('/').pop()!.replace(/\.md$/, ''), path: v.path}
    return null
}

const tagText = (v: Value) => (v.type === 'String' && v.tag ? v.value.replace(/^#/, '') : toDisplay(v))

/** How the value shows: one of the renderers below, with what it needs. */
const shown = computed(() => {
    const v = value.value
    if (props.id === 'file.name') return {as: 'links' as const, links: [{label: toText(v), path: props.row.path}]}
    const link = linkOf(v)
    if (link) return {as: 'links' as const, links: [link]}
    if (v.type === 'Boolean' || (v.type === 'Null' && property.value.source === 'note' && property.value.kind === 'checkbox')) {
        return {as: 'checkbox' as const, checked: v.type === 'Boolean' && v.value}
    }
    if (v.type === 'List') {
        const links = v.items.map(linkOf)
        if (links.every((l): l is ValueLink => l !== null)) return {as: 'links' as const, links}
        if (property.value.source === 'note' || v.items.every(i => i.type === 'String' && i.tag)) return {as: 'pills' as const, pills: v.items.map(tagText), tags: v.items.every(i => i.type === 'String' && i.tag)}
    }
    if (v.type === 'Null') return {as: 'none' as const}
    if (v.type === 'URL') return {as: 'url' as const, url: v.value}
    if (v.type === 'HTML') return {as: 'html' as const, html: filterXSS(v.value)}
    if (v.type === 'Image') return {as: 'image' as const, src: /^[a-z][\w+.-]*:/i.test(v.src) ? v.src : convertFileSrc(`${ctx.session.rootPath}/${v.src}`)}
    if (v.type === 'String' && v.icon) return {as: 'icon' as const, icon: `i-lucide-${v.value}`}
    if (v.type === 'Error') return {as: 'error' as const, message: v.message}
    return {as: 'text' as const, text: toDisplay(v)}
})
</script>

<template>
    <span v-if="shown.as === 'links'" class="min-w-0" :class="{truncate: oneLine}">
        <template v-for="(link, i) in shown.links" :key="i">
            <template v-if="i">, </template>
            <a
                v-if="link.path"
                href="#"
                class="text-primary hover:underline cursor-pointer"
                @click.prevent.stop="openNote(link.path)"
            >{{ link.label }}</a>
            <span v-else class="text-muted">{{ link.label }}</span>
        </template>
    </span>
    <UCheckbox
        v-else-if="shown.as === 'checkbox'"
        :model-value="shown.checked"
        :disabled="!editable"
        @update:model-value="checked => emit('toggle', checked === true)"
    />
    <span v-else-if="shown.as === 'pills'" class="inline-flex gap-1 min-w-0 max-w-full" :class="oneLine ? 'overflow-hidden' : 'flex-wrap'">
        <!-- Tags in the accent colour, other lists neutral, as Obsidian's pills. -->
        <UBadge v-for="(pill, i) in shown.pills" :key="i" :label="pill" :color="shown.tags ? 'primary' : 'neutral'" variant="soft" size="md" class="shrink-0"/>
    </span>
    <a
        v-else-if="shown.as === 'url'"
        :href="shown.url"
        class="min-w-0 text-primary hover:underline cursor-pointer"
        :class="{truncate: oneLine}"
        @click.prevent.stop="openUrlInBrowser(($event.currentTarget as HTMLAnchorElement).getAttribute('href')!)"
    >{{ shown.url }}</a>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitized by filterXSS -->
    <span v-else-if="shown.as === 'html'" class="min-w-0" :class="{truncate: oneLine}" v-html="shown.html"/>
    <img v-else-if="shown.as === 'image'" :src="shown.src" alt="" class="h-full max-w-full object-contain py-1">
    <UIcon v-else-if="shown.as === 'icon'" :name="shown.icon" class="size-4 shrink-0"/>
    <UTooltip v-else-if="shown.as === 'error'" :text="shown.message">
        <span class="flex items-center gap-1 min-w-0">
            <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 text-warning"/>
            <span class="truncate">{{ shown.message }}</span>
        </span>
    </UTooltip>
    <span v-else-if="shown.as === 'text'" class="min-w-0" :class="{truncate: oneLine}">{{ shown.text }}</span>
</template>
