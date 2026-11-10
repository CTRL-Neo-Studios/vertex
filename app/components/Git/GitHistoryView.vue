<script setup lang="ts">
import type {GitChange, GitCommit} from "#shared/types/app/git";
import {graphRows, type GraphLine} from "#shared/utils/gitGraph";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useGitRepo} from "~/composables/git/useGitRepo";
import {gitClient} from "~/utils/gitClient";
import {diffTabId} from "~/utils/gitDiff";
import {usePanelActions} from "~/utils/panelViews";

/**
 * History, the Git map: every branch's, remote branch's and tag's commits as a graph, newest first, paged in while
 * scrolling (only the rows on screen are drawn). A selected commit shows its message and files, each opening its diff
 * against the first parent. It reloads when the repository moves (a commit, a pull, a branch switch, a fetch).
 */
const {t, locale} = useI18n()
const $route = useRoute()
const $navi = useAppNavigator()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {openTab} = useActiveTabs(session)
const git = useGitRepo(session)
const {status, problem} = git
const root = session?.rootPath

const PAGE = 300
const ROW = 28
const LANE = 14
const MAX_LANES = 12

const commits = shallowRef<GitCommit[]>([])
const more = ref(true)
let loading = false
let generation = 0
/** The first page again (as many rows as are loaded, so the list doesn't jump), or the next one. */
async function load(reset: boolean) {
    if (!root || (!reset && (loading || !more.value))) return
    const current = reset ? ++generation : generation
    loading = true
    try {
        const limit = reset ? Math.max(PAGE, commits.value.length) : PAGE
        const page = await gitClient.log(root, reset ? 0 : commits.value.length, limit)
        if (current !== generation) return
        commits.value = reset ? page : [...commits.value, ...page]
        more.value = page.length === limit
    } catch (e) {
        console.error('[git] log', e)
    } finally {
        if (current === generation) loading = false
    }
}
// The repository moved: its head, branch, upstream or how far they're apart.
watch(() => status.value && [status.value.head, status.value.branch, status.value.upstream, status.value.ahead, status.value.behind].join(' '),
    moved => moved !== undefined && void load(true))

usePanelActions(() => [
    {id: 'refresh', label: t('app.git.refresh'), icon: 'i-lucide-rotate-cw', onSelect: () => void git.refresh().then(() => load(true))},
])

const rows = computed(() => graphRows(commits.value))
const lanes = computed(() => Math.min(rows.value.reduce((most, row) => Math.max(most, row.width), 1), MAX_LANES))
const {list, containerProps, wrapperProps} = useVirtualList(commits, {itemHeight: ROW, overscan: 20})
watch(() => list.value.at(-1)?.index, last => {
    if (last !== undefined && last >= commits.value.length - 40) void load(false)
})

// The graph: lanes are columns, each a color; a line takes the color of the lane it comes from (or goes to, below).
const COLORS = ['var(--ui-primary)', 'var(--ui-info)', 'var(--ui-success)', 'var(--ui-warning)', 'var(--ui-error)', 'var(--ui-secondary)']
const colorOf = (lane: number) => COLORS[lane % COLORS.length]
const x = (lane: number) => lane * LANE + LANE / 2
function pathOf(line: GraphLine) {
    if (line.half === 'full') return `M${x(line.from)} 0V${ROW}`
    const [y1, y2] = line.half === 'top' ? [0, ROW / 2] : [ROW / 2, ROW]
    const [x1, x2] = [x(line.from), x(line.to)]
    const mid = (y1 + y2) / 2
    return x1 === x2 ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`
}
const lineColor = (line: GraphLine) => colorOf(line.half === 'bottom' ? line.to : line.from)

interface RefBadge { label: string, icon: string, color: 'primary' | 'neutral' | 'warning', current?: boolean }
/** A commit's branches, remote branches and tags; HEAD alone when it's detached there. */
function badgesOf(commit: GitCommit): RefBadge[] {
    const head = commit.refs.includes('HEAD')
    const badges = commit.refs.flatMap((ref): RefBadge[] => {
        if (ref.startsWith('refs/heads/')) {
            const name = ref.slice('refs/heads/'.length)
            return [{label: name, icon: 'i-lucide-git-branch', color: 'primary', current: head && name === status.value?.branch}]
        }
        if (ref.startsWith('refs/remotes/')) {
            const name = ref.slice('refs/remotes/'.length)
            return name.endsWith('/HEAD') ? [] : [{label: name, icon: 'i-lucide-cloud', color: 'neutral'}]
        }
        if (ref.startsWith('refs/tags/')) return [{label: ref.slice('refs/tags/'.length), icon: 'i-lucide-tag', color: 'warning'}]
        return []
    })
    return head && !badges.some(b => b.current) ? [{label: 'HEAD', icon: 'i-lucide-crosshair', color: 'neutral', current: true}, ...badges] : badges
}

const relative = computed(() => new Intl.RelativeTimeFormat(locale.value, {numeric: 'auto'}))
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]
function ago(time: number) {
    const seconds = time - Date.now() / 1000
    const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? ['second', 1]
    return relative.value.format(Math.round(seconds / size), unit)
}
const fullDate = (time: number) => new Date(time * 1000).toLocaleString(locale.value)

// The selected commit; its details and files are `GitCommitDetails`'.
const selected = shallowRef<GitCommit>()
const selectById = (id: string) => (selected.value = commits.value.find(c => c.id === id) ?? selected.value)

async function openDiff(change: GitChange) {
    const current = status.value
    if (!current || !selected.value || !session) return
    const spec = {top: current.top, path: change.path, side: selected.value.id, ...(change.origPath ? {origPath: change.origPath} : {})}
    await $navi.toWorkspaceTab(session.uuid, openTab(diffTabId(spec), 'diff'))
}

const box = useTemplateRef<HTMLElement>('box')
const {width} = useElementSize(box)
const wide = computed(() => width.value >= 720)
</script>

<template>
    <div ref="box" class="h-full min-h-0 flex flex-col">
        <UEmpty
            v-if="problem"
            variant="naked"
            size="sm"
            icon="i-lucide-git-graph"
            class="flex-1"
            :title="t(problem === 'missing' ? 'app.git.missing.title' : 'app.git.notRepo.title')"
        />
        <UEmpty
            v-else-if="status && !commits.length && !more"
            variant="naked"
            size="sm"
            icon="i-lucide-git-graph"
            class="flex-1"
            :title="t('app.git.history.empty')"
            :description="t('app.git.history.emptyHint')"
        />
        <div v-else :class="['flex-1 min-h-0 flex', wide ? 'flex-row' : 'flex-col']">
            <div v-bind="containerProps" class="flex-1 min-h-0 min-w-0 overflow-y-auto" data-git-history>
                <div v-bind="wrapperProps">
                    <div
                        v-for="{data: commit, index} in list"
                        :key="commit.id"
                        :data-commit="commit.id"
                        :class="['flex items-center gap-2 pe-3 cursor-pointer text-sm', selected?.id === commit.id ? 'bg-elevated' : 'hover:bg-elevated/50']"
                        :style="{ height: `${ROW}px` }"
                        @click="selected = commit"
                    >
                        <svg :width="lanes * LANE + 4" :height="ROW" class="shrink-0 overflow-hidden" aria-hidden="true">
                            <path
                                v-for="(line, i) in rows[index]?.lines"
                                :key="i"
                                :d="pathOf(line)"
                                :stroke="lineColor(line)"
                                fill="none"
                                stroke-width="1.5"
                            />
                            <circle
                                v-if="rows[index]"
                                :cx="x(rows[index].lane)"
                                :cy="ROW / 2"
                                :r="commit.refs.includes('HEAD') ? 4.5 : 3.5"
                                :fill="commit.parents.length > 1 ? 'var(--ui-bg)' : colorOf(rows[index].lane)"
                                :stroke="colorOf(rows[index].lane)"
                                stroke-width="1.5"
                            />
                        </svg>
                        <UBadge
                            v-for="badge in badgesOf(commit)"
                            :key="badge.label"
                            :label="badge.label"
                            :icon="badge.icon"
                            :color="badge.color"
                            :variant="badge.current ? 'solid' : 'soft'"
                            size="sm"
                            class="shrink-0 max-w-40"
                            :ui="{ label: 'truncate' }"
                        />
                        <span class="flex-1 min-w-0 truncate">{{ commit.subject }}</span>
                        <span v-if="wide" class="shrink-0 max-w-32 truncate text-xs text-muted">{{ commit.author }}</span>
                        <UTooltip :text="fullDate(commit.time)">
                            <span class="shrink-0 text-xs text-dimmed tabular-nums">{{ ago(commit.time) }}</span>
                        </UTooltip>
                    </div>
                </div>
            </div>
            <GitCommitDetails
                v-if="selected && root"
                :root
                :commit="selected"
                :wide
                @close="selected = undefined"
                @select="selectById"
                @open="openDiff"
            />
        </div>
    </div>
</template>
