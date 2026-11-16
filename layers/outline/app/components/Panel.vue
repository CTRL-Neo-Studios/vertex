<script setup lang="ts">
import type {PanelViewProps} from "#shared/plugin/api";
import {jumpTo, outlineOf} from "../lib/outline";

const props = defineProps<PanelViewProps>()

const {t} = useI18n()
// The shown tab's note editor; none for another kind of tab or a file that isn't a note.
const view = computed(() => {
    const tabId = props.session.tabs.active()
    return tabId ? props.session.editor.viewOf(tabId) : undefined
})
const outline = computed(() => view.value && outlineOf(view.value).value)
</script>

<template>
    <div class="w-full h-full">
        <div v-if="view && outline" class="w-full grid grid-cols-1 gap-1.5">
            <!-- By position: typing above a heading shifts every `from` below it, and a `from` key remounted those rows. -->
            <UTooltip :text="t('plugins.outline.jumpToHeading', {level: item.level})" v-for="(item, i) in outline.headings" :key="i">
                <UButton
                    :variant="item.from === outline.active ? 'subtle' : 'soft'"
                    :color="item.from === outline.active ? 'primary' : 'neutral'"
                    size="sm"
                    :label="item.text"
                    :icon="`i-lucide-heading-${item.level}`"
                    @click="jumpTo(view!, item.from)"
                />
            </UTooltip>
        </div>
    </div>
</template>
