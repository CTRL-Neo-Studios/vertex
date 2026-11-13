<script setup lang="ts">
import {convertFileSrc} from "@tauri-apps/api/core";
import {toText, type RowScope} from "@type32/obsidian-bases-parser";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useBaseContext} from "~/composables/bases/useBaseContext";

/**
 * A card of the cards and kanban layouts. With the view's `image` property it has a cover (`imageAspectRatio` of its
 * width, `defaultRatio` when unset; `imageFit` cover or contain) from a linked file, a URL or a `#hex` colour. The first
 * property is the title; the others show their label over their value, "—" when empty. Clicking opens its note.
 */
const props = withDefaults(defineProps<{ row: RowScope, defaultRatio?: number }>(), {defaultRatio: 1})
const ctx = useBaseContext()
const {getFileByPath} = useActiveWorkspaceIndex(ctx.session)
const {openTab} = useActiveTabs(ctx.session)
const $navi = useAppNavigator()

const view = computed(() => ctx.view.value)
const order = computed(() => view.value.order ?? ['file.name'])
const imageId = computed(() => (typeof view.value.image === 'string' && view.value.image ? view.value.image : null))

/** The cover: an image address, a colour, or neither (an empty cover). */
const cover = computed((): { image?: string, color?: string } => {
    const value = props.row.property(imageId.value!)
    const file = (path: string | null) => (path ? {image: convertFileSrc(`${ctx.session.rootPath}/${path}`)} : {})
    if (value.type === 'Link') return file(ctx.host.resolve(value.path.split('#')[0]!, value.from))
    if (value.type === 'URL') return {image: value.value}
    if (value.type === 'Image') return /^[a-z][\w+.-]*:/i.test(value.src) ? {image: value.src} : file(value.src)
    if (value.type === 'String' && /^#[\da-f]{3,8}$/i.test(value.value.trim())) return {color: value.value.trim()}
    return {}
})

const coverStyle = computed(() => {
    const ratio = typeof view.value.imageAspectRatio === 'number' ? view.value.imageAspectRatio : props.defaultRatio
    const {image, color} = cover.value
    return {
        aspectRatio: `${1 / ratio}`,
        backgroundColor: color,
        backgroundImage: image ? `url(${JSON.stringify(image)})` : undefined,
        backgroundSize: view.value.imageFit === 'contain' ? 'contain' : 'cover',
    }
})

const title = computed(() => {
    const value = props.row.property(order.value[0]!)
    return value.type === 'Null' ? '' : toText(value)
})

async function open() {
    const node = getFileByPath(`${ctx.session.rootPath}/${props.row.path}`)
    if (node) await $navi.toWorkspaceTab(ctx.session.uuid, openTab(node.uuid))
}
</script>

<template>
    <div class="flex flex-col overflow-hidden rounded-lg bg-elevated/40 ring ring-default cursor-pointer hover:ring-accented" @click="open">
        <div v-if="imageId" :style="coverStyle" class="w-full shrink-0 bg-center bg-no-repeat bg-elevated"/>
        <div class="px-2 pt-2 truncate text-[15px] font-semibold text-highlighted">{{ title }}</div>
        <div v-for="id in order.slice(1)" :key="id" class="px-2 pt-0.5 min-w-0">
            <div class="text-xs text-muted truncate">{{ ctx.property(id).label }}</div>
            <div class="flex min-w-0 h-6 items-center whitespace-nowrap">
                <span v-if="props.row.property(id).type === 'Null'" class="text-dimmed">—</span>
                <ViewerEditorBasesValue v-else :row="props.row" :id="id"/>
            </div>
        </div>
    </div>
</template>
