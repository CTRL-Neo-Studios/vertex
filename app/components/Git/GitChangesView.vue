<script setup lang="ts">
import {ask} from "@tauri-apps/plugin-dialog";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {CommandPaletteGroup, ContextMenuItem} from "@nuxt/ui";
import type {GitBranch, GitFile, GitState} from "#shared/types/app/git";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useScrollFade} from "~/composables/utility/useScrollFade";
import {isStaged, isUnstaged, useGitRepo} from "~/composables/git/useGitRepo";
import {gitClient} from "~/utils/gitClient";
import {usePanelActions} from "~/utils/panelViews";

/** The Git view: the branch, Sync, what changed (staged and not), and the commit box. */
const {t} = useI18n()
const $route = useRoute()
const $navi = useAppNavigator()
const {openUrlInBrowser, openFileWithDefaultApp, revealFilesInFileManager} = useAppOpener()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {getFileByPath} = useActiveWorkspaceIndex(session)
const {openTab} = useActiveTabs(session)
const git = useGitRepo(session)
const {status, problem, busy} = git

const staged = computed(() => status.value?.files.filter(isStaged) ?? [])
const unstaged = computed(() => status.value?.files.filter(isUnstaged) ?? [])
const idle = computed(() => !busy.value && !!status.value)
const message = ref('')
// The list fades where it meets the commit box, and at the top once scrolled.
const fade = useScrollFade(useTemplateRef<HTMLElement>('listEl'), {bottom: true})
// Only chats kept in the workspace end up in its repository; the user decides whether they do.
const settings = useSettingsScope()
const chatsInWorkspace = computed(() => settings.effective.value?.aiConfig.chatStorage === 'workspace')
const syncChats = ref(true)
const createRepo = () => git.init(syncChats.value)
const canCommit = computed(() => idle.value && !!message.value.trim() && !!status.value?.files.length)

usePanelActions(() => {
    const refresh = {id: 'refresh', label: t('app.git.refresh'), icon: 'i-lucide-rotate-cw', onSelect: git.refresh}
    if (!status.value) return [refresh]
    const disabled = !idle.value
    return [
        {id: 'fetch', label: t('app.git.fetch'), icon: 'i-lucide-cloud-download', onSelect: git.fetch, disabled},
        {id: 'pull', label: t('app.git.pull'), icon: 'i-lucide-arrow-down-to-line', onSelect: git.pull, disabled},
        {id: 'push', label: t('app.git.push'), icon: 'i-lucide-arrow-up-from-line', onSelect: git.push, disabled},
        refresh,
    ]
})

const STATES: Record<GitState, { key: string, color: string }> = {
    '.': {key: 'unchanged', color: 'text-muted'},
    'M': {key: 'modified', color: 'text-warning'},
    'A': {key: 'added', color: 'text-success'},
    'D': {key: 'deleted', color: 'text-error'},
    'R': {key: 'renamed', color: 'text-info'},
    'C': {key: 'copied', color: 'text-success'},
    'T': {key: 'typeChanged', color: 'text-warning'},
    'U': {key: 'conflicted', color: 'text-error'},
    '?': {key: 'untracked', color: 'text-success'},
}
const stateOf = (letter: GitState) => STATES[letter]
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const dirOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0))

/** The file's index entry, when it's in the workspace (the repository may hold more) and still exists. */
function indexed(file: GitFile) {
    const current = status.value
    const root = session?.rootPath
    if (!current || !root || !file.path.startsWith(current.prefix)) return undefined
    return getFileByPath(`${root}/${file.path.slice(current.prefix.length)}`)
}

async function open(file: GitFile) {
    const node = indexed(file)
    if (node && session) await $navi.toWorkspaceTab(session.uuid, openTab(node.uuid))
}

async function discard(files: GitFile[]) {
    const confirmed = await ask(t('app.git.discardConfirm.description', {count: files.length}), {
        title: t('app.git.discardConfirm.title'),
        kind: 'warning',
        okLabel: t('app.git.discardConfirm.confirm'),
        cancelLabel: t('app.generic.cancel'),
    })
    if (confirmed) await git.discard(files)
}

interface RowAction { id: string, label: string, icon: string, run: (file: GitFile) => unknown }
const sections = computed(() => {
    const openAction: RowAction = {id: 'open', label: t('app.git.openFile'), icon: 'i-lucide-file-text', run: open}
    return [
        {
            id: 'staged', label: t('app.git.staged'), hint: t('app.git.stagedHint'), files: staged.value,
            letter: (f: GitFile) => f.index,
            bulk: {label: t('app.git.unstageAll'), icon: 'i-lucide-minus', run: () => git.unstage(staged.value)},
            actions: [openAction, {id: 'unstage', label: t('app.git.unstage'), icon: 'i-lucide-minus', run: (f: GitFile) => git.unstage([f])}],
        },
        {
            id: 'changes', label: t('app.git.changes'), hint: t('app.git.changesHint'), files: unstaged.value,
            letter: (f: GitFile): GitState => (f.conflicted ? 'U' : f.worktree),
            bulk: {label: t('app.git.stageAll'), icon: 'i-lucide-plus', run: () => git.stage(unstaged.value)},
            actions: [
                openAction,
                {id: 'discard', label: t('app.git.discard'), icon: 'i-lucide-undo-2', run: (f: GitFile) => discard([f])},
                {id: 'stage', label: t('app.git.stage'), icon: 'i-lucide-plus', run: (f: GitFile) => git.stage([f])},
            ],
        },
    ].filter(s => s.files.length)
})
type Section = (typeof sections.value)[number]

/** Gone from the disk: nothing to open or reveal. */
const deleted = (file: GitFile) => file.worktree === 'D' || (file.index === 'D' && file.worktree === '.')
const fullPathOf = (file: GitFile) => `${status.value?.top}/${file.path}`

/** A file row's right-click menu: open it, stage or unstage it (or discard it), copy its path, reveal it. */
function fileMenu(section: Section, file: GitFile): ContextMenuItem[][] {
    const disabled = !idle.value
    const changes: ContextMenuItem[] = section.id === 'staged'
        ? [{label: t('app.git.unstage'), icon: 'i-lucide-minus', disabled, onSelect: () => void git.unstage([file])}]
        : [
            {label: t('app.git.stage'), icon: 'i-lucide-plus', disabled, onSelect: () => void git.stage([file])},
            {label: t('app.git.discard'), icon: 'i-lucide-undo-2', color: 'error', disabled, onSelect: () => void discard([file])},
        ]
    return [
        [
            {label: t('app.git.openFile'), icon: 'i-lucide-file-text', disabled: !indexed(file), onSelect: () => void open(file)},
            {label: t('app.editor.ui.openInDefaultApp'), icon: 'i-lucide-square-arrow-out-up-right', disabled: deleted(file), onSelect: () => void openFileWithDefaultApp(fullPathOf(file))},
        ],
        changes,
        [
            {label: t('app.editor.ui.copyRelativePath'), icon: 'i-lucide-copy', onSelect: () => void writeText(file.path)},
            {label: t('app.editor.ui.copyFullPath'), icon: 'i-lucide-copy', onSelect: () => void writeText(fullPathOf(file))},
            {label: t('app.editor.ui.revealInFileExplorer'), icon: 'i-lucide-folder-search', disabled: deleted(file), onSelect: () => void revealFilesInFileManager([fullPathOf(file)])},
        ],
    ]
}

/** A section header's right-click menu: the bulk action, and for Changes, discarding them all (asks first). */
function sectionMenu(section: Section): ContextMenuItem[][] {
    const disabled = !idle.value
    return [[
        {label: section.bulk.label, icon: section.bulk.icon, disabled, onSelect: () => void section.bulk.run()},
        ...(section.id === 'changes'
            ? [{label: t('app.git.discardAll'), icon: 'i-lucide-undo-2', color: 'error' as const, disabled, onSelect: () => void discard(section.files)}]
            : []),
    ]]
}

async function commit(andPush: boolean) {
    if (!canCommit.value || !await git.commit(message.value.trim())) return
    message.value = ''
    if (andPush) await git.push()
}

async function sync() {
    await git.sync(message.value.trim())
    // Committed, even if the pull or push after it failed: the message is in the history now.
    if (!status.value?.files.length) message.value = ''
}

// Branches: switch to one, or type a new name to create it.
const branchOpen = ref(false)
const branches = shallowRef<GitBranch[]>([])
const branchTerm = ref('')
watch(branchOpen, async open => {
    if (!open || !session?.rootPath) return
    branchTerm.value = ''
    branches.value = await gitClient.branches(session.rootPath).catch(() => [])
})
async function switchTo(name: string, create: boolean) {
    branchOpen.value = false
    await git.switchBranch(name, create)
}
const branchGroups = computed<CommandPaletteGroup[]>(() => {
    // A remote branch checks out as a local branch of the same name, tracking it.
    const pick = (b: GitBranch) => ({
        label: b.name,
        icon: b.remote ? 'i-lucide-cloud' : 'i-lucide-git-branch',
        suffix: b.current ? t('app.git.current') : undefined,
        disabled: b.current,
        onSelect: () => void switchTo(b.remote ? b.name.slice(b.name.indexOf('/') + 1) : b.name, false),
    })
    const local = branches.value.filter(b => !b.remote)
    const term = branchTerm.value.trim()
    const create = term && !local.some(b => b.name === term)
        ? [{id: 'create', label: '', ignoreFilter: true, items: [{label: t('app.git.createBranch', {name: term}), icon: 'i-lucide-plus', onSelect: () => void switchTo(term, true)}]}]
        : []
    return [
        ...create,
        {id: 'local', label: t('app.git.branches'), items: local.map(pick)},
        {id: 'remote', label: t('app.git.remoteBranches'), items: branches.value.filter(b => b.remote).map(pick)},
    ]
})
const branchLabel = computed(() => status.value?.branch ?? t('app.git.detached', {id: status.value?.head?.slice(0, 7) ?? ''}))
const mergeActions = computed(() => [{
    label: t('app.git.merging.abort'), color: 'neutral' as const, variant: 'outline' as const, size: 'xs' as const,
    disabled: !idle.value, onClick: () => void git.mergeAbort(),
}])
</script>

<template>
    <div class="h-full min-h-0 flex flex-col">
        <UEmpty
            v-if="problem === 'missing'"
            variant="naked"
            size="sm"
            icon="i-lucide-git-branch"
            class="flex-1"
            :title="t('app.git.missing.title')"
            :description="t('app.git.missing.description')"
            :actions="[
                { label: t('app.git.install'), icon: 'i-lucide-external-link', size: 'sm', onClick: () => void openUrlInBrowser('https://git-scm.com/downloads') },
                { label: t('app.git.checkAgain'), color: 'neutral', variant: 'outline', size: 'sm', onClick: () => void git.refresh() },
            ]"
        />
        <UEmpty
            v-else-if="problem === 'not-repo'"
            variant="naked"
            size="sm"
            icon="i-lucide-git-branch"
            class="flex-1"
            :title="t('app.git.notRepo.title')"
            :description="t('app.git.notRepo.description')"
        >
            <template #actions>
                <div class="flex flex-col items-center gap-3">
                    <UCheckbox
                        v-if="chatsInWorkspace"
                        v-model="syncChats"
                        size="sm"
                        :label="t('app.git.syncChats')"
                        :description="t('app.git.syncChatsHint')"
                    />
                    <UButton
                        :label="t('app.git.createRepo')"
                        icon="i-lucide-git-branch-plus"
                        size="sm"
                        :loading="!!busy"
                        @click="createRepo"
                    />
                </div>
            </template>
        </UEmpty>
        <template v-else-if="status">
            <div class="px-2 pt-2 pb-1 flex flex-col gap-2">
                <div class="flex items-center gap-1 min-w-0">
                    <UPopover v-model:open="branchOpen" :content="{ align: 'start' }">
                        <UButton
                            :label="branchLabel"
                            icon="i-lucide-git-branch"
                            trailing-icon="i-lucide-chevron-down"
                            color="neutral"
                            variant="ghost"
                            size="sm"
                            class="min-w-0"
                            :ui="{ label: 'truncate' }"
                            :disabled="!idle"
                            :aria-label="t('app.git.branches')"
                        />
                        <template #content>
                            <UCommandPalette
                                v-model:search-term="branchTerm"
                                :groups="branchGroups"
                                :placeholder="t('app.git.branchPlaceholder')"
                                class="h-72 w-64"
                                size="sm"
                            />
                        </template>
                    </UPopover>
                    <UTooltip
                        v-if="status.upstream"
                        :text="t('app.git.aheadBehind', { ahead: status.ahead, behind: status.behind, upstream: status.upstream })"
                    >
                        <span class="ms-auto shrink-0 flex items-center gap-1.5 text-xs text-muted tabular-nums">
                            <span class="flex items-center"><UIcon name="i-lucide-arrow-up" class="size-3.5"/>{{ status.ahead }}</span>
                            <span class="flex items-center"><UIcon name="i-lucide-arrow-down" class="size-3.5"/>{{ status.behind }}</span>
                        </span>
                    </UTooltip>
                </div>
                <UAlert
                    v-if="status.merging"
                    color="warning"
                    variant="subtle"
                    icon="i-lucide-git-merge"
                    :title="t('app.git.merging.title')"
                    :description="t('app.git.merging.description')"
                    :actions="mergeActions"
                />
                <UTooltip :text="t('app.git.syncHint')">
                    <UButton
                        block
                        size="sm"
                        icon="i-lucide-refresh-cw"
                        :loading="!!busy"
                        :label="busy ?? t('app.git.sync')"
                        :disabled="!idle || status.merging"
                        @click="sync"
                    />
                </UTooltip>
            </div>
            <div ref="listEl" :class="['flex-1 min-h-0 overflow-y-auto no-scrollbar px-1.5 pb-2', fade]">
                <UEmpty
                    v-if="!sections.length"
                    variant="naked"
                    size="sm"
                    icon="i-lucide-circle-check"
                    :title="t('app.git.clean')"
                    :description="t('app.git.cleanHint')"
                />
                <section v-for="section in sections" :key="section.id" :data-git-section="section.id" class="mt-1">
                    <UContextMenu :items="sectionMenu(section)" size="sm">
                        <div class="flex items-center gap-1 ps-1.5 h-7 text-xs font-medium text-muted">
                            <UTooltip :text="section.hint">
                                <span class="flex items-center gap-1.5">
                                    {{ section.label }}
                                    <UBadge :label="String(section.files.length)" size="sm" color="neutral" variant="soft"/>
                                </span>
                            </UTooltip>
                            <UTooltip :text="section.bulk.label">
                                <UButton
                                    class="ms-auto"
                                    :icon="section.bulk.icon"
                                    color="neutral"
                                    variant="ghost"
                                    size="xs"
                                    :aria-label="section.bulk.label"
                                    :disabled="!idle"
                                    @click="section.bulk.run()"
                                />
                            </UTooltip>
                        </div>
                    </UContextMenu>
                    <UContextMenu v-for="file in section.files" :key="file.path" :items="fileMenu(section, file)" size="sm">
                        <div
                            :data-git-file="file.path"
                            :class="['group flex items-center gap-1.5 ps-1.5 pe-0.5 h-7 rounded-md text-sm hover:bg-elevated/60 focus-within:bg-elevated/60 data-[state=open]:bg-elevated/60 outline-none', indexed(file) ? 'cursor-pointer' : 'cursor-default']"
                            tabindex="0"
                            @click="open(file)"
                            @keydown.enter.self="open(file)"
                        >
                            <span class="truncate shrink-0 max-w-[70%]">{{ nameOf(file.path) }}</span>
                            <span class="truncate text-xs text-dimmed">{{ dirOf(file.path) }}</span>
                            <div class="ms-auto flex items-center shrink-0">
                                <!-- Shown on hover, and while the row or a button in it has focus. -->
                                <div class="hidden group-hover:flex group-focus-within:flex">
                                    <UTooltip v-for="action in section.actions" :key="action.id" :text="action.label">
                                        <UButton
                                            :icon="action.icon"
                                            color="neutral"
                                            variant="ghost"
                                            size="xs"
                                            :aria-label="action.label"
                                            :disabled="!idle || (action.id === 'open' && !indexed(file))"
                                            @click.stop="action.run(file)"
                                        />
                                    </UTooltip>
                                </div>
                                <UTooltip :text="t(`app.git.states.${stateOf(section.letter(file)).key}`)">
                                    <span :class="['w-5 text-center font-mono text-xs', stateOf(section.letter(file)).color]">{{ section.letter(file) }}</span>
                                </UTooltip>
                            </div>
                        </div>
                    </UContextMenu>
                </section>
            </div>
            <div class="p-2 flex flex-col gap-1.5">
                <UTextarea
                    v-model="message"
                    :placeholder="t('app.git.message')"
                    :rows="2"
                    :maxrows="8"
                    autoresize
                    size="sm"
                    @keydown.meta.enter.prevent="commit(false)"
                    @keydown.ctrl.enter.prevent="commit(false)"
                />
                <div class="flex gap-1.5">
                    <UTooltip :text="staged.length ? t('app.git.commitHint') : t('app.git.commitAllHint')">
                        <UButton class="flex-1" block size="sm" :label="t('app.git.commit')" :disabled="!canCommit" @click="commit(false)"/>
                    </UTooltip>
                    <UTooltip :text="t('app.git.commitPushHint')">
                        <UButton size="sm" color="neutral" variant="outline" :label="t('app.git.commitPush')" :disabled="!canCommit" @click="commit(true)"/>
                    </UTooltip>
                </div>
            </div>
        </template>
    </div>
</template>
