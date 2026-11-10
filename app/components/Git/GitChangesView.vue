<script setup lang="ts">
import {ask, open as openDialog} from "@tauri-apps/plugin-dialog";
import {platform} from "@tauri-apps/plugin-os";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {CommandPaletteGroup, ContextMenuItem} from "@nuxt/ui";
import type {GitBranch, GitFile, GitState} from "#shared/types/app/git";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {useScrollFade} from "~/composables/utility/useScrollFade";
import {useTour} from "~/composables/utility/useTour";
import {isStaged, isUnstaged, useGitRepo, type GitSetupStep} from "~/composables/git/useGitRepo";
import {useCommitMessage} from "~/composables/git/useCommitMessage";
import {gitClient} from "~/utils/gitClient";
import {diffTabId} from "~/utils/gitDiff";
import {GIT_STATES} from "~/utils/gitStates";
import {usePanelActions} from "~/utils/panelViews";
import {usePanels} from "~/composables/active/usePanels";

/** The Git view: the branch, Sync, what changed (staged and not), and the commit box. */
const {t} = useI18n()
const $route = useRoute()
const $navi = useAppNavigator()
const {openUrlInBrowser, openFileWithDefaultApp, revealFilesInFileManager} = useAppOpener()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {getFileByPath} = useActiveWorkspaceIndex(session)
const {openTab} = useActiveTabs(session)
/** The setup wizard while it runs: from Create repository to the first push, or the one step a failure sent the user to. */
const setup = ref<{step: GitSetupStep, single?: boolean}>()
const git = useGitRepo(session, {setup: step => void (setup.value = {step, single: true})})
const {status, problem, busy} = git
const panels = usePanels(session)
const setupStep = computed(() => (problem.value === 'not-repo' ? 'create' : status.value ? setup.value?.step : undefined))

/** History: in its panel (placed there if it was hidden), else in a tab. */
async function showHistory() {
    if (!await panels.placeView('gitHistory')) await panels.openInTab('gitHistory')
}

const staged = computed(() => status.value?.files.filter(isStaged) ?? [])
const unstaged = computed(() => status.value?.files.filter(isUnstaged) ?? [])
/** Sync is writing its commit message with AI. */
const drafting = ref(false)
const idle = computed(() => !busy.value && !!status.value && !drafting.value)
// Only chats kept in the workspace end up in its repository; the user decides whether they do.
const settings = useSettingsScope()
const chatsInWorkspace = computed(() => settings.effective.value?.aiConfig.chatStorage === 'workspace')

// No git: install it (macOS: Apple's developer tools), or point Vertex at one (`gitConfig.path`, global only).
const $qt = useQuickToasts()
const os = platform()
const downloadUrl = `https://git-scm.com/downloads/${os === 'macos' ? 'mac' : os === 'windows' ? 'win' : 'linux'}`
const appSettings = useAppSettings()
onMounted(appSettings.load)
const gitPath = computed(() => appSettings.config.value?.gitConfig.path ?? '')
async function setGitPath(path: string) {
    await appSettings.load()
    await appSettings.save({gitConfig: {path}})
    await git.refresh()
}
async function locateGit() {
    const path = await openDialog({multiple: false, directory: false, title: t('app.git.missing.locateTitle')})
    if (path) await setGitPath(path)
}
async function installTools() {
    try {
        await gitClient.installTools()
    } catch (e) {
        $qt.error(t('app.git.missing.toolsFailed'), String(e))
    }
}

// The tour: once after setup, then from its button. It explains the git terms the view uses.
const tourSeen = useLocalStorage('vertex-git-tour-seen', false)
const tour = useTour(() => (['sync', 'branch', 'aheadBehind', 'remoteActions', 'list', 'commit', 'history'] as const).map(id => ({
    target: {
        sync: '[data-git-sync]',
        branch: '[data-git-branch]',
        aheadBehind: '[data-git-ahead-behind]',
        remoteActions: '[data-panel-action="fetch"]',
        list: '[data-git-list]',
        commit: '[data-git-commit-box]',
        history: '[data-panel-action="history"]',
    }[id],
    title: t(`app.git.tour.${id}.title`),
    description: t(`app.git.tour.${id}.description`),
})))
function startTour() {
    tourSeen.value = true
    tour.start()
}
async function finishSetup() {
    setup.value = undefined
    if (tourSeen.value) return
    await nextTick()
    startTour()
}

usePanelActions(() => {
    const refresh = {id: 'refresh', label: t('app.git.refresh'), icon: 'i-lucide-rotate-cw', onSelect: git.refresh}
    if (!status.value || setupStep.value) return [refresh]
    const disabled = !idle.value
    return [
        {id: 'fetch', label: t('app.git.fetch'), icon: 'i-lucide-cloud-download', onSelect: git.fetch, disabled},
        {id: 'pull', label: t('app.git.pull'), icon: 'i-lucide-arrow-down-to-line', onSelect: git.pull, disabled},
        {id: 'push', label: t('app.git.push'), icon: 'i-lucide-arrow-up-from-line', onSelect: git.push, disabled},
        refresh,
        {id: 'history', label: t('app.git.history.show'), icon: 'i-lucide-git-graph', onSelect: showHistory},
        {id: 'tour', label: t('app.git.tour.start'), icon: 'i-lucide-circle-help', onSelect: startTour},
    ]
})

const stateOf = (letter: GitState) => GIT_STATES[letter]
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

/** Section headers and file rows in one list, so only the rows on screen are drawn (a new repository lists everything). */
const ROW = 28
const HEADER = 32
type Row = {key: string, section: Section, file?: GitFile}
const rows = computed(() => sections.value.flatMap((section): Row[] => [
    {key: section.id, section},
    ...section.files.map(file => ({key: `${section.id}:${file.path}`, section, file})),
]))
const {list, containerProps, wrapperProps} = useVirtualList(rows, {itemHeight: i => (rows.value[i]?.file ? ROW : HEADER), overscan: 10})
// The list fades where it meets the commit box, and at the top once scrolled.
const fade = useScrollFade(containerProps.ref, {bottom: true})

/** A row opens its changes in a diff tab (Staged: the index; Changes: the disk); a conflicted file opens itself, to fix. */
async function openChanges(section: Section, file: GitFile) {
    const current = status.value
    if (file.conflicted) return open(file)
    if (!current || !session) return
    const side = section.id === 'staged' ? 'staged' : 'worktree'
    const spec = {top: current.top, path: file.path, side, ...(file.origPath ? {origPath: file.origPath} : {})}
    await $navi.toWorkspaceTab(session.uuid, openTab(diffTabId(spec), 'diff'))
}

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
            {label: t('app.git.diff.openChanges'), icon: 'i-lucide-git-compare', onSelect: () => void openChanges(section, file)},
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

const commitBox = useTemplateRef<{message: string}>('commitBox')
async function commit(message: string, andPush: boolean) {
    if (!await git.commit(message)) return false
    if (andPush) await git.push()
    return true
}

// AI commit messages (feature `commitMessage`): the box's button, and Sync when the box is empty.
const commitMessage = useCommitMessage(session?.rootPath)
/** A message for what the commit takes (`all`: every change); `''` after explaining a failure. */
async function writeMessage(all: boolean) {
    const current = status.value
    if (!current) return ''
    try {
        return await commitMessage.generate(current, all)
    } catch (e) {
        $qt.error(t('app.git.ai.failed'), String(e))
        return ''
    }
}
const writeForBox = computed(() => (commitMessage.available.value ? () => writeMessage(!staged.value.length) : undefined))

async function sync() {
    const box = commitBox.value
    let message = box?.message.trim() ?? ''
    if (!message && commitMessage.available.value) {
        drafting.value = true
        await git.refresh()
        // Nothing to commit needs no message; a failed one falls back to "Update N file(s)".
        if (status.value?.files.length) message = await writeMessage(true)
        drafting.value = false
    }
    await git.sync(message)
    // Committed, even if the pull or push after it failed: the message is in the history now.
    if (box && !status.value?.files.length) box.message = ''
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
            :description="gitPath ? t('app.git.missing.configured', {path: gitPath}) : t(`app.git.missing.${os === 'macos' ? 'macos' : 'description'}`)"
            data-git-missing
        >
            <template #actions>
                <div class="flex flex-col items-stretch gap-1.5 w-56">
                    <UButton v-if="os === 'macos'" block size="sm" icon="i-lucide-download" :label="t('app.git.missing.installTools')" @click="installTools"/>
                    <UButton
                        block
                        size="sm"
                        icon="i-lucide-external-link"
                        :color="os === 'macos' ? 'neutral' : 'primary'"
                        :variant="os === 'macos' ? 'outline' : 'solid'"
                        :label="t('app.git.install')"
                        @click="openUrlInBrowser(downloadUrl)"
                    />
                    <UButton block size="sm" color="neutral" variant="outline" icon="i-lucide-folder-search" :label="t('app.git.missing.locate')" @click="locateGit"/>
                    <UButton v-if="gitPath" block size="sm" color="neutral" variant="outline" icon="i-lucide-search" :label="t('app.git.missing.automatic')" @click="setGitPath('')"/>
                    <UButton block size="sm" color="neutral" variant="ghost" icon="i-lucide-rotate-cw" :label="t('app.git.checkAgain')" @click="git.refresh()"/>
                </div>
            </template>
        </UEmpty>
        <GitSetup
            v-else-if="setupStep && session?.rootPath"
            :step="setupStep"
            :single="setup?.single"
            :git
            :root="session.rootPath"
            :chats-in-workspace="chatsInWorkspace"
            @next="step => setup = {step}"
            @done="finishSetup"
        />
        <template v-else-if="status">
            <div class="px-2 pt-2 pb-1 flex flex-col gap-1.5">
                <UTooltip :text="t('app.git.syncHint')">
                    <UButton
                        block
                        size="sm"
                        icon="i-lucide-refresh-cw"
                        :loading="!!busy || drafting"
                        :label="busy ?? (drafting ? t('app.git.ai.writing') : t('app.git.sync'))"
                        :disabled="!idle || status.merging"
                        data-git-sync
                        @click="sync"
                    />
                </UTooltip>
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
                            data-git-branch
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
                        <span class="ms-auto shrink-0 flex items-center gap-2 pe-1.5 text-xs text-muted tabular-nums" data-git-ahead-behind>
                            <span class="flex items-center gap-0.5"><UIcon name="i-lucide-arrow-up" class="size-4"/>{{ status.ahead }}</span>
                            <span class="flex items-center gap-0.5"><UIcon name="i-lucide-arrow-down" class="size-4"/>{{ status.behind }}</span>
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
            </div>
            <div v-bind="containerProps" :class="['flex-1 min-h-0 overflow-y-auto no-scrollbar px-1.5 pb-2', fade]" data-git-list>
                <UEmpty
                    v-if="!rows.length"
                    variant="naked"
                    size="sm"
                    icon="i-lucide-circle-check"
                    :title="t('app.git.clean')"
                    :description="t('app.git.cleanHint')"
                />
                <div v-bind="wrapperProps">
                    <template v-for="{data: {key, section, file}} in list" :key="key">
                        <UContextMenu v-if="file" :items="fileMenu(section, file)" size="sm">
                            <div
                                :data-git-file="file.path"
                                :data-git-section="section.id"
                                class="group flex items-center gap-1.5 ps-1.5 pe-0.5 h-7 rounded-md text-sm cursor-pointer hover:bg-elevated/60 focus-within:bg-elevated/60 data-[state=open]:bg-elevated/60 outline-none"
                                tabindex="0"
                                @click="openChanges(section, file)"
                                @keydown.enter.self="openChanges(section, file)"
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
                        <UContextMenu v-else :items="sectionMenu(section)" size="sm">
                            <div :data-git-section-header="section.id" class="flex items-center gap-1 ps-1.5 pt-1 h-8 text-xs font-medium text-muted">
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
                    </template>
                </div>
            </div>
            <GitCommitBox ref="commitBox" :ready="idle && !!status.files.length" :staged="!!staged.length" :commit :write="writeForBox" data-git-commit-box/>
        </template>
        <TourPopover :tour/>
    </div>
</template>
