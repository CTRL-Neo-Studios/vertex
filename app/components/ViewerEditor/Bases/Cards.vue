<script setup lang="ts">
import {useBaseContext} from "~/composables/bases/useBaseContext";
import {useGroupFolds} from "~/composables/bases/useGroupFolds";

/** Obsidian's cards layout: a grid of `cardSize`-wide cards (`Card`), stretched to fill the row; grouped with headings. */
const ctx = useBaseContext()
const folds = useGroupFolds()
const view = computed(() => ctx.view.value)
const cardSize = computed(() => (typeof view.value.cardSize === 'number' ? view.value.cardSize : 200))
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
                <!-- content-visibility lets the browser skip laying out cards far off screen; not in a note, whose height
                     would follow the placeholder size each time the editor redraws the embed. -->
                <ViewerEditorBasesCard
                    v-for="row in group.rows"
                    :key="row.path"
                    :row="row"
                    class="pb-0.5"
                    :class="{'[content-visibility:auto] [contain-intrinsic-size:auto_240px]': ctx.embed !== 'note'}"
                />
            </div>
        </template>
    </div>
</template>
