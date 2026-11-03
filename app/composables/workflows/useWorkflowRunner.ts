import {CompileError, compile, DOCUMENT_FORMAT, hashProgram, migrate, type Diagnostic, type DocumentV1, type RunOptions, type RunResult} from "@type32/workflows/core"
import type {ActiveSession} from "#shared/types/active/sessions"
import {defaultAppWorkflowConfig} from "#shared/utils/defaults/apps"
import {overlayVault} from "#shared/workflows/dryRun"
import {createVertexEffects, undoOps, type Op, type UndoResult} from "#shared/workflows/effects"
import {baseNameOf, type Vault, type YamlTools} from "#shared/workflows/vault"
import {vertexLanguage, type PickOptions, type VertexEffects} from "#shared/workflows/vertex"
import WorkflowAskModal, {type Ask} from "~/components/Modals/WorkflowAskModal.vue"
import WorkflowPickModal from "~/components/Modals/WorkflowPickModal.vue"
import WorkflowTrashModal from "~/components/Modals/WorkflowTrashModal.vue"
import WorkflowTrustModal from "~/components/Modals/WorkflowTrustModal.vue"
import {useActiveTabs} from "~/composables/active/useActiveTabs"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex"
import {useAppNavigator} from "~/composables/app/useAppNavigator"
import {useAppSettings} from "~/composables/app/useAppSettings"
import useQuickToasts from "~/composables/utility/useQuickToasts"
import {useWorkflowManifest} from "~/composables/workflows/useWorkflowManifest"
import {useWorkspaceVault} from "~/composables/workflows/useWorkspaceVault"

export const RUN_EVENT = 'vertex.onManual'

/** A new workflow: On Run, ready to wire. */
export const newWorkflow = (): DocumentV1 => ({
    format: DOCUMENT_FORMAT,
    language: {id: vertexLanguage.manifest.language.id, version: vertexLanguage.manifest.language.version},
    program: {graph: {nodes: [{id: 'n1', type: RUN_EVENT, version: 1}], edges: []}, variables: [], functions: []},
    view: {positions: {n1: {x: 0, y: 0}}, groups: []},
})

/** A `.workflow` file's text as a document. The file is untrusted JSON, so it's loaded through `migrate`. */
export function parseWorkflow(text: string): { doc?: DocumentV1, problems: Diagnostic[] } {
    if (!text.trim()) return {doc: newWorkflow(), problems: []}
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch (error) {
        return {problems: [{code: 'E_INVALID_DOCUMENT', severity: 'error', message: String(error)}]}
    }
    const loaded = migrate(raw, vertexLanguage)
    return 'doc' in loaded ? {doc: loaded.doc, problems: []} : {problems: loaded.diagnostics}
}

export interface RunOutcome {
    dry: boolean
    result: RunResult
    /** What changed, or for a dry run what would change. */
    ops: Op[]
}

/** Where a run starts from. */
export interface RunContext {
    /** The note it runs on, for Current note. */
    note?: string
}

/** What the editor's live run (`editor.run`) passes along: its trace, cancel signal and step control. */
export type LiveOptions = Pick<RunOptions<unknown>, 'onTrace' | 'signal' | 'beforeStep'>

/**
 * Runs workflow documents against a workspace. A dry run executes the same effects over an in-memory overlay;
 * a real run of a program whose hash isn't trusted yet first shows its capabilities and dry-run diff (§11).
 * Prompts (the `ui` capability) are interactive: their time doesn't count toward the timeout, and dry runs ask
 * too (Appendix A #66). The last real run's ops are kept in memory for undo.
 */
export function useWorkflowRunner(session: ActiveSession) {
    const vault = useWorkspaceVault(session)
    const {config, save} = useAppSettings()
    const {t} = useI18n()
    const $qt = useQuickToasts()
    const $toast = useToast()
    const $index = useActiveWorkspaceIndex(session)
    const {openTab} = useActiveTabs(session)
    const $navi = useAppNavigator()
    const manifest = useWorkflowManifest()
    const overlay = useOverlay()
    const trustModal = overlay.create(WorkflowTrustModal)
    const trashModal = overlay.create(WorkflowTrashModal)
    const askModal = overlay.create(WorkflowAskModal)
    const pickModal = overlay.create(WorkflowPickModal)
    // The editor package's helpers, auto-imported.
    const yaml: YamlTools = {frontmatterRange, parseYaml, stringifyYaml}
    const undoable = shallowRef<Op[]>([])

    const settings = () => config.value?.workflowConfig ?? defaultAppWorkflowConfig()

    /** The app's side of the `ui` capability for one run. A cancelled prompt faults its node. */
    function uiFor(name: string, dry: boolean, context: RunContext): VertexEffects['ui'] {
        let trashAllowed: Promise<boolean> | undefined
        async function answered<T>(result: Promise<unknown>): Promise<T> {
            const value = await result
            if (value === undefined) throw new Error(t('app.editor.ui.workflow.cancelled'))
            return value as T
        }
        const ask = <T>(question: Ask) => answered<T>(askModal.open({name, ...question}).result)
        const pick = (prompt: string, options: PickOptions) =>
            answered<string[]>(pickModal.open({sessionId: session.uuid, title: prompt || name, ...options}).result)
        return {
            askText: (question, initial) => ask({kind: 'text', question, initial}),
            askNumber: (question, initial) => ask({kind: 'number', question, initial}),
            askChoice: (question, choices) => ask({kind: 'choice', question, choices}),
            askYesNo: question => ask({kind: 'yesNo', question}),
            form: (question, fields) => ask({kind: 'form', question, fields}),
            pick,
            async message(text) {
                $qt.info(name, text)
            },
            async currentNote() {
                return context.note ?? (await pick(t('app.editor.ui.workflow.whichNote'), {kind: 'file', multiple: false, extensions: 'md'}))[0]!
            },
            async open(path) {
                if (dry) return
                const file = $index.getFileByPath(`${session.rootPath}/${path}`)
                if (!file || file.isFolder) throw new Error(`"${path}" isn't a file`)
                await $navi.toWorkspaceTab(session.uuid, openTab(file.uuid))
            },
            confirmTrash() {
                if (dry || !settings().confirmTrash) return Promise.resolve(true)
                return (trashAllowed ??= trashModal.open({name}).result.then(Boolean))
            },
        }
    }

    /** Compiles (throws CompileError on any error diagnostic) and dispatches the On Run event. */
    async function execute(doc: DocumentV1, name: string, dry: boolean, context: RunContext, live: LiveOptions = {}): Promise<RunOutcome> {
        const program = compile(doc, vertexLanguage)
        const {maxLoopIterations, maxStackDepth, wallClockTimeoutMs} = settings()
        const runId = new Date().toISOString().replace(/[:.]/g, '-')
        const target: Vault = dry ? overlayVault(vault, yaml) : vault
        const {effects, ops} = createVertexEffects(target, {yaml, runId, ui: uiFor(name, dry, context)})
        const result = await program.dispatch(RUN_EVENT, undefined, {
            effects,
            limits: {steps: maxLoopIterations, depth: maxStackDepth, ...(wallClockTimeoutMs > 0 && {timeoutMs: wallClockTimeoutMs})},
            trace: 'values',
            interactive: ['ui'],
            ...live,
        })
        return {dry, result, ops}
    }

    const dryRun = (doc: DocumentV1, name: string, context: RunContext = {}, live?: LiveOptions) => execute(doc, name, true, context, live)

    /**
     * Asks before a real run, unless the program's hash or the workspace is trusted. The prompt shows the
     * capabilities, and the dry-run diff when there's one to show: a program that talks to the user (`ui`) isn't
     * dry-run first, or its questions and messages would come before the prompt and again after it.
     */
    async function trust(doc: DocumentV1, name: string): Promise<boolean> {
        const hash = await hashProgram(doc)
        const root = session.rootPath!
        if (settings().trustedPrograms[hash] || settings().trustedWorkspaces[root]) return true
        const used = compile(doc, vertexLanguage).capabilities
        const capabilities = manifest.value.capabilities.filter(c => used.has(c.id))
        const plan = used.has('ui') ? undefined : await dryRun(doc, name)
        const answer = await trustModal.open({name, capabilities, plan}).result
        if (!answer) return false
        const current = settings()
        const trustedAt = new Date().toISOString()
        await save({workflowConfig: answer === 'workspace'
            ? {...current, trustedWorkspaces: {...current.trustedWorkspaces, [root]: {trustedAt}}}
            : {...current, trustedPrograms: {...current.trustedPrograms, [hash]: {name, trustedAt}}}})
        return true
    }

    /** `undefined` when the user declined to trust the program. Call `trust` first to ask outside a live run. */
    async function run(doc: DocumentV1, name: string, context: RunContext = {}, live?: LiveOptions): Promise<RunOutcome | undefined> {
        if (!await trust(doc, name)) return undefined
        const outcome = await execute(doc, name, false, context, live)
        undoable.value = outcome.ops
        return outcome
    }

    async function undo(): Promise<UndoResult> {
        const result = await undoOps(vault, undoable.value)
        undoable.value = []
        return result
    }

    /** A run's result as a toast, with Undo for a real run's changes. */
    function report(name: string, {dry, result, ops}: RunOutcome) {
        const prefix = dry ? `${t('app.editor.ui.workflow.dryRun')} · ` : ''
        const ok = result.status === 'ok'
        $toast.add({
            title: `${name}: ${prefix}${ok ? t('app.editor.ui.workflow.ok', {steps: result.steps}) : result.status === 'aborted' ? t('app.editor.ui.workflow.aborted') : t('app.editor.ui.workflow.fault', {code: result.fault?.code ?? ''})}`,
            description: result.fault?.message ?? t(dry ? 'app.editor.ui.workflow.wouldChangeCount' : 'app.editor.ui.workflow.changedCount', {count: ops.length}),
            color: ok ? 'success' : 'error',
            icon: ok ? 'i-lucide-circle-check' : 'i-lucide-octagon-alert',
            ...(!dry && ops.length && {
                actions: [{
                    label: t('app.editor.ui.workflow.undo'),
                    icon: 'i-lucide-undo-2',
                    color: 'neutral' as const,
                    variant: 'outline' as const,
                    onClick: async () => {
                        const undone = await undo()
                        $qt.success(t('app.editor.ui.workflow.undone', {count: undone.undone}))
                    },
                }],
            }),
        })
    }

    /** Runs a `.workflow` file outside its tab (file tree, command palette, a note's menu), reporting in a toast. */
    async function runFile(path: string, dry: boolean, context: RunContext = {}) {
        const name = baseNameOf(path).replace(/\.workflow$/i, '')
        try {
            const {doc, problems} = parseWorkflow(await vault.read(path))
            if (!doc) return $qt.error(t('app.editor.ui.workflow.invalid'), problems[0]?.message)
            const outcome = dry ? await dryRun(doc, name, context) : await run(doc, name, context)
            if (!outcome) return $qt.info(t('app.editor.ui.workflow.declined'))
            report(name, outcome)
        } catch (error) {
            $qt.error(t('app.editor.ui.workflow.failed'), error instanceof CompileError ? error.diagnostics[0]?.message : String(error))
        }
    }

    return {dryRun, trust, run, runFile, undo, canUndo: computed(() => undoable.value.length > 0)}
}
