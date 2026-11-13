<script setup lang="ts">
import type {RowScope} from "@type32/obsidian-bases-parser";
import {useBaseContext} from "~/composables/bases/useBaseContext";
import {useGroupFolds} from "~/composables/bases/useGroupFolds";

/**
 * Obsidian's list layout: one item per row, marked by a bullet, a number or nothing (`markers`). The first property
 * leads; the others follow on the line joined by `separator`, or, with `indentProperties`, as bulleted lines under it.
 * Empty values are left out. Numbers restart in each group.
 */
const ctx = useBaseContext()
const folds = useGroupFolds()

const view = computed(() => ctx.view.value)
const order = computed(() => view.value.order ?? ['file.name'])
const markers = computed(() => (view.value.markers === 'number' || view.value.markers === 'none' ? view.value.markers : 'bullet'))
const indent = computed(() => view.value.indentProperties === true)
const separator = computed(() => (typeof view.value.separator === 'string' ? view.value.separator : ', '))

/** The properties after the first that have a value. */
const rest = (row: RowScope) => order.value.slice(1).filter(id => row.property(id).type !== 'Null')
</script>

<template>
    <div class="flex-1 min-h-0 overflow-auto px-4 py-3 text-sm">
        <template v-for="(group, g) in ctx.result.value.groups" :key="g">
            <ViewerEditorBasesGroupHeading v-if="view.groupBy" :group="group" :folded="folds.isFolded(group)" class="-ms-2" @toggle="folds.toggle(group)"/>
            <ul v-if="!view.groupBy || !folds.isFolded(group)" :class="{'pb-3 mb-3 border-b border-default': view.groupBy}">
                <li v-for="(row, i) in group.rows" :key="row.path" class="py-0.5">
                    <div class="flex items-center gap-2 min-w-0">
                        <span v-if="markers === 'bullet'" class="w-3 shrink-0 text-center text-dimmed">•</span>
                        <span v-else-if="markers === 'number'" class="shrink-0 text-muted tabular-nums">{{ i + 1 }}.</span>
                        <span class="flex flex-wrap items-center min-w-0">
                            <ViewerEditorBasesValue :row="row" :id="order[0]!"/>
                            <template v-if="!indent">
                                <template v-for="id in rest(row)" :key="id">
                                    <span class="whitespace-pre text-muted">{{ separator }}</span>
                                    <ViewerEditorBasesValue :row="row" :id="id"/>
                                </template>
                            </template>
                        </span>
                    </div>
                    <ul v-if="indent" class="ms-8">
                        <li v-for="id in rest(row)" :key="id" class="flex items-center gap-2 min-w-0 py-0.5">
                            <span class="w-3 shrink-0 text-center text-dimmed">•</span>
                            <ViewerEditorBasesValue :row="row" :id="id"/>
                        </li>
                    </ul>
                </li>
            </ul>
        </template>
    </div>
</template>
