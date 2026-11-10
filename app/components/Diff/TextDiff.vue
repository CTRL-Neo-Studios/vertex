<script setup lang="ts">
import {diffCounts, isBinaryText, lineDiff, splitRows, type DiffFold, type DiffLine} from "#shared/utils/textDiff";

/**
 * Two versions of a text, line by line: side by side when there's room and in one column when there isn't; unchanged
 * stretches fold (click to open; an opened fold stays open when the text changes). Where the versions come from is the
 * caller's (git's diff tab, a chat's staged change). `sides` missing = still loading; a side missing = the file isn't
 * on it (new, deleted). `failed` shows instead of the diff. The `header` slot gets the +/− counts.
 */
const props = defineProps<{ sides?: { before?: string, after?: string }, failed?: boolean }>()
defineSlots<{ header?(props: { added: number, removed: number, binary: boolean }): unknown }>()
const {t} = useI18n()

const binary = computed(() => [props.sides?.before, props.sides?.after].some(text => text !== undefined && isBinaryText(text)))
const items = computed(() => (props.sides && !binary.value ? lineDiff(props.sides.before ?? '', props.sides.after ?? '') : []))
const counts = computed(() => diffCounts(items.value))
// Folds are known by their first line, so an opened one stays open when the diff reloads.
const opened = ref(new Set<number>())
const foldKey = (fold: DiffFold) => fold.lines[0]?.old ?? 0
const shown = computed(() => items.value.flatMap(i => (i.kind === 'fold' && opened.value.has(foldKey(i)) ? i.lines : [i])))
const rows = computed(() => splitRows(shown.value))
const unfold = (fold: DiffFold) => (opened.value = new Set([...opened.value, foldKey(fold)]))

const box = useTemplateRef<HTMLElement>('box')
const {width} = useElementSize(box)
const sideBySide = computed(() => width.value >= 760)

const lineClass = (line?: DiffLine) =>
    !line ? 'bg-elevated/40' : line.kind === 'add' ? 'bg-success/10' : line.kind === 'del' ? 'bg-error/10' : ''
const sign = (line?: DiffLine) => (line?.kind === 'add' ? '+' : line?.kind === 'del' ? '−' : '')
const signClass = (line?: DiffLine) => (line?.kind === 'add' ? 'text-success' : 'text-error')
</script>

<template>
    <div class="h-full min-h-0 flex flex-col">
        <slot name="header" :added="counts.added" :removed="counts.removed" :binary/>
        <div ref="box" class="flex-1 min-h-0 overflow-y-auto">
            <UEmpty
                v-if="failed"
                variant="naked"
                size="sm"
                icon="i-lucide-file-x"
                class="h-full"
                :title="t('app.diff.loadFailed')"
            />
            <UEmpty
                v-else-if="binary"
                variant="naked"
                size="sm"
                icon="i-lucide-file-question"
                class="h-full"
                :title="t('app.diff.binary')"
                :description="t('app.diff.binaryHint')"
            />
            <UEmpty
                v-else-if="sides && !counts.added && !counts.removed"
                variant="naked"
                size="sm"
                icon="i-lucide-circle-check"
                class="h-full"
                :title="t('app.diff.noChanges')"
            />
            <div v-else-if="sides" class="py-2 font-mono text-xs leading-5" :data-diff-layout="sideBySide ? 'split' : 'unified'">
                <template v-if="sideBySide">
                    <template v-for="(row, i) in rows" :key="i">
                        <button
                            v-if="'fold' in row"
                            type="button"
                            class="w-full py-0.5 bg-elevated/60 hover:bg-elevated text-center text-muted font-sans"
                            @click="unfold(row.fold)"
                        >
                            {{ t('app.diff.unchanged', {count: row.fold.lines.length}) }}
                        </button>
                        <div v-else class="grid grid-cols-2 divide-x divide-default">
                            <div v-for="(line, side) in [row.left, row.right]" :key="side" :class="['flex min-w-0', lineClass(line)]">
                                <span class="w-12 shrink-0 pe-2 text-right text-dimmed tabular-nums select-none">{{ side === 0 ? line?.old : line?.new }}</span>
                                <span :class="['w-4 shrink-0 select-none', signClass(line)]">{{ sign(line) }}</span>
                                <span class="flex-1 min-w-0 pe-3 whitespace-pre-wrap break-words">{{ line?.text }}</span>
                            </div>
                        </div>
                    </template>
                </template>
                <template v-else>
                    <template v-for="(item, i) in shown" :key="i">
                        <button
                            v-if="item.kind === 'fold'"
                            type="button"
                            class="w-full py-0.5 bg-elevated/60 hover:bg-elevated text-center text-muted font-sans"
                            @click="unfold(item)"
                        >
                            {{ t('app.diff.unchanged', {count: item.lines.length}) }}
                        </button>
                        <div v-else :class="['flex min-w-0', lineClass(item)]">
                            <span class="w-10 shrink-0 pe-2 text-right text-dimmed tabular-nums select-none">{{ item.old }}</span>
                            <span class="w-10 shrink-0 pe-2 text-right text-dimmed tabular-nums select-none">{{ item.new }}</span>
                            <span :class="['w-4 shrink-0 select-none', signClass(item)]">{{ sign(item) }}</span>
                            <span class="flex-1 min-w-0 pe-3 whitespace-pre-wrap break-words">{{ item.text }}</span>
                        </div>
                    </template>
                </template>
            </div>
        </div>
    </div>
</template>
