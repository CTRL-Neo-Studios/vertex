<script setup lang="ts">
import {toText, type QueryGroup} from "@type32/obsidian-bases-parser";
import {useBaseContext} from "~/composables/bases/useBaseContext";

/** A group's heading in every layout ("status **done**"); clicking it folds the group. */
const props = defineProps<{ group: QueryGroup, folded: boolean }>()
const emit = defineEmits<{ toggle: [] }>()
const {t} = useI18n()
const ctx = useBaseContext()
const label = computed(() => (ctx.view.value.groupBy ? ctx.property(ctx.view.value.groupBy.property).label : ''))
</script>

<template>
    <button class="flex items-center gap-1.5 px-2 h-[30px] text-sm" @click="emit('toggle')">
        <span class="text-muted">{{ label }}</span>
        <span class="font-semibold">{{ props.group.key === null ? t('app.editor.ui.bases.none') : toText(props.group.key) }}</span>
        <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed transition-transform" :class="{'-rotate-90': props.folded}"/>
    </button>
</template>
