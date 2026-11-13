<script setup lang="ts">
import {convertFileSrc} from "@tauri-apps/api/core";
import {toText, type RowScope} from "@type32/obsidian-bases-parser";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useBaseContext} from "~/composables/bases/useBaseContext";
import {useGroupFolds} from "~/composables/bases/useGroupFolds";

/**
 * Obsidian's cards layout: a grid of `cardSize`-wide cards (stretched to fill the row). With an `image` property each
 * card has a cover (`imageAspectRatio` of its width, `imageFit` cover or contain) from a linked file, a URL or a `#hex`
 * colour. The first property is the title; the others show their label over their value, "—" when empty. A card opens
 * its note.
 */
const ctx = useBaseContext()
const folds = useGroupFolds()
const {getFileByPath} = useActiveWorkspaceIndex(ctx.session)
const {openTab} = useActiveTabs(ctx.session)
const $navi = useAppNavigator()

const view = computed(() => ctx.view.value)
const order = computed(() => view.value.order ?? ['file.name'])
const numberOption = (key: string, fallback: number) => (typeof view.value[key] === 'number' ? view.value[key] as number : fallback)
const cardSize = computed(() => numberOption('cardSize', 200))
const ratio = computed(() => numberOption('imageAspectRatio', 1))
const imageId = computed(() => (typeof view.value.image === 'string' && view.value.image ? view.value.image : null))

/** A card's cover: an image address, a colour, or neither (an empty cover). */
function cover(row: RowScope): { image?: string, color?: string } {
    const value = row.property(imageId.value!)
    const file = (path: string | null) => (path ? {image: convertFileSrc(`${ctx.session.rootPath}/${path}`)} : {})
    if (value.type === 'Link') return file(ctx.host.resolve(value.path.split('#')[0]!, value.from))
    if (value.type === 'URL') return {image: value.value}
    if (value.type === 'Image') return /^[a-z][\w+.-]*:/i.test(value.src) ? {image: value.src} : file(value.src)
    if (value.type === 'String' && /^#[\da-f]{3,8}$/i.test(value.value.trim())) return {color: value.value.trim()}
    return {}
}

function coverStyle(row: RowScope) {
    const {image, color} = cover(row)
    return {
        aspectRatio: `${1 / ratio.value}`,
        backgroundColor: color,
        backgroundImage: image ? `url(${JSON.stringify(image)})` : undefined,
        backgroundSize: view.value.imageFit === 'contain' ? 'contain' : 'cover',
    }
}

function title(row: RowScope) {
    const value = row.property(order.value[0]!)
    return value.type === 'Null' ? '' : toText(value)
}

async function open(row: RowScope) {
    const node = getFileByPath(`${ctx.session.rootPath}/${row.path}`)
    if (node) await $navi.toWorkspaceTab(ctx.session.uuid, openTab(node.uuid))
}
</script>

<template>
    <div class="flex-1 min-h-0 overflow-auto p-3 text-sm">
        <template v-for="(group, i) in ctx.result.value.groups" :key="i">
            <ViewerEditorBasesGroupHeading v-if="view.groupBy" :group="group" :folded="folds.isFolded(group)" class="-ms-2" @toggle="folds.toggle(group)"/>
            <div
                v-if="!view.groupBy || !folds.isFolded(group)"
                class="grid gap-3"
                :class="{'pb-3 mb-3 border-b border-default': view.groupBy}"
                :style="{gridTemplateColumns: `repeat(auto-fill, minmax(${cardSize}px, 1fr))`}"
            >
                <!-- content-visibility lets the browser skip laying out cards far off screen. -->
                <div
                    v-for="row in group.rows"
                    :key="row.path"
                    class="flex flex-col overflow-hidden rounded-2xl bg-elevated/40 ring ring-default pb-0.5 cursor-pointer [content-visibility:auto] [contain-intrinsic-size:auto_240px] hover:ring-accented"
                    @click="open(row)"
                >
                    <div v-if="imageId" :style="coverStyle(row)" class="w-full shrink-0 bg-center bg-no-repeat bg-elevated"/>
                    <div class="px-2 pt-2 truncate text-[15px] font-semibold text-highlighted">{{ title(row) }}</div>
                    <div v-for="id in order.slice(1)" :key="id" class="px-2 pt-0.5 min-w-0">
                        <div class="text-xs text-muted truncate">{{ ctx.property(id).label }}</div>
                        <div class="flex min-w-0 h-6 items-center whitespace-nowrap">
                            <span v-if="row.property(id).type === 'Null'" class="text-dimmed">—</span>
                            <ViewerEditorBasesValue v-else :row="row" :id="id"/>
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </div>
</template>
