<script setup lang="ts">
import {readTextFile} from "@tauri-apps/plugin-fs";
import {isBinaryText, lineDiff, splitRows, type DiffFold, type DiffLine} from "#shared/utils/textDiff";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {diffSideLabel, diffSpecOf} from "~/utils/gitDiff";
import {gitClient} from "~/utils/gitClient";

/**
 * A diff tab: one file's two versions line by line, side by side when there's room and in one column when there
 * isn't; unchanged stretches fold. The working tree and staged sides reload whenever the workspace changes on disk
 * (an edit, a commit, a checkout); a commit's never change.
 */
const props = defineProps<{ tabId: string }>()

const {t} = useI18n()
const $route = useRoute()
const $navi = useAppNavigator()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const index = useActiveWorkspaceIndex(session)
const {openTab} = useActiveTabs(session)
const spec = diffSpecOf(props.tabId)

/** The two versions; `undefined` for a side the file isn't on (new, deleted). */
const sides = shallowRef<{ before?: string, after?: string }>()
const failed = ref(false)

async function load() {
    const root = session?.rootPath
    if (!spec || !root) return
    const show = (rev: string | null, path: string) => gitClient.showFile(root, rev, path).catch(() => undefined)
    const old = spec.origPath ?? spec.path
    const [before, after] = await Promise.all(
        spec.side === 'worktree' ? [show('HEAD', old), readTextFile(`${spec.top}/${spec.path}`).catch(() => undefined)]
            : spec.side === 'staged' ? [show('HEAD', old), show(null, spec.path)]
                : [show(`${spec.side}^`, old), show(spec.side, spec.path)],
    )
    failed.value = before === undefined && after === undefined
    sides.value = {before, after}
}
onMounted(load)
if (spec?.side === 'worktree' || spec?.side === 'staged') {
    const reload = useDebounceFn(load, 300)
    onBeforeUnmount(index.on(event => {
        if (event.type === 'changed') void reload()
    }))
}

const binary = computed(() => [sides.value?.before, sides.value?.after].some(text => text !== undefined && isBinaryText(text)))
const items = computed(() => (sides.value && !binary.value ? lineDiff(sides.value.before ?? '', sides.value.after ?? '') : []))
const counts = computed(() => ({
    added: items.value.filter(i => i.kind === 'add').length,
    removed: items.value.filter(i => i.kind === 'del').length,
}))
// Folds are known by their first line, so an opened one stays open when the diff reloads.
const opened = ref(new Set<number>())
const foldKey = (fold: DiffFold) => fold.lines[0]?.old ?? 0
const shown = computed(() => items.value.flatMap(i => (i.kind === 'fold' && opened.value.has(foldKey(i)) ? i.lines : [i])))
const rows = computed(() => splitRows(shown.value))
const unfold = (fold: DiffFold) => (opened.value = new Set([...opened.value, foldKey(fold)]))

const box = useTemplateRef<HTMLElement>('box')
const {width} = useElementSize(box)
const sideBySide = computed(() => width.value >= 760)

const name = spec ? spec.path.slice(spec.path.lastIndexOf('/') + 1) : ''
const dir = spec ? spec.path.slice(0, Math.max(spec.path.lastIndexOf('/'), 0)) : ''
const sideLabel = spec ? diffSideLabel(spec, t) : ''
const against = spec && (spec.side === 'worktree' || spec.side === 'staged') ? t('app.git.diff.againstHead') : t('app.git.diff.againstParent')
const note = computed(() => {
    if (!sides.value || failed.value) return ''
    if (sides.value.before === undefined) return t('app.git.diff.added')
    if (sides.value.after === undefined) return t('app.git.diff.deleted')
    return spec?.origPath ? t('app.git.diff.renamed', {path: spec.origPath}) : ''
})
const node = computed(() => (spec ? index.getFileByPath(`${spec.top}/${spec.path}`) : undefined))

async function openFile() {
    if (node.value && session) await $navi.toWorkspaceTab(session.uuid, openTab(node.value.uuid))
}

const lineClass = (line?: DiffLine) =>
    !line ? 'bg-elevated/40' : line.kind === 'add' ? 'bg-success/10' : line.kind === 'del' ? 'bg-error/10' : ''
const sign = (line?: DiffLine) => (line?.kind === 'add' ? '+' : line?.kind === 'del' ? '−' : '')
const signClass = (line?: DiffLine) => (line?.kind === 'add' ? 'text-success' : 'text-error')
</script>

<template>
    <div class="h-full min-h-0 flex flex-col">
        <div class="shrink-0 flex items-center gap-2 px-4 h-10 border-b border-default text-sm">
            <UIcon name="i-lucide-git-compare" class="size-4 shrink-0 text-muted"/>
            <span class="font-medium truncate shrink-0 max-w-1/2">{{ name }}</span>
            <span class="text-xs text-dimmed truncate">{{ dir }}</span>
            <UTooltip :text="against">
                <UBadge :label="sideLabel" size="sm" color="neutral" variant="soft" class="shrink-0"/>
            </UTooltip>
            <span v-if="note" class="text-xs text-muted truncate">{{ note }}</span>
            <div class="flex-1"/>
            <span v-if="!binary && !failed" class="shrink-0 flex items-center gap-2 text-xs tabular-nums">
                <span class="text-success">+{{ counts.added }}</span>
                <span class="text-error">−{{ counts.removed }}</span>
            </span>
            <UButton
                v-if="node"
                :label="t('app.git.openFile')"
                icon="i-lucide-file-text"
                color="neutral"
                variant="ghost"
                size="xs"
                class="shrink-0"
                @click="openFile"
            />
        </div>
        <div ref="box" class="flex-1 min-h-0 overflow-y-auto">
            <UEmpty
                v-if="!spec || failed"
                variant="naked"
                size="sm"
                icon="i-lucide-file-x"
                class="h-full"
                :title="t('app.git.diff.loadFailed')"
            />
            <UEmpty
                v-else-if="binary"
                variant="naked"
                size="sm"
                icon="i-lucide-file-question"
                class="h-full"
                :title="t('app.git.diff.binary')"
                :description="t('app.git.diff.binaryHint')"
            />
            <UEmpty
                v-else-if="sides && !counts.added && !counts.removed"
                variant="naked"
                size="sm"
                icon="i-lucide-circle-check"
                class="h-full"
                :title="t('app.git.diff.noChanges')"
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
                            {{ t('app.git.diff.unchanged', {count: row.fold.lines.length}) }}
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
                            {{ t('app.git.diff.unchanged', {count: item.lines.length}) }}
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
