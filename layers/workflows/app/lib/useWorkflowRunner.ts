import {CompileError, compile, DOCUMENT_FORMAT, hashProgram, migrate, type Diagnostic, type DocumentV1, type RunOptions} from "@type32/workflows/core"
import type {SessionContext} from "#shared/plugin/api"
import {baseNameOf, obsidianYaml, type Vault} from "#shared/plugin/vault"
import {overlayVault} from "../../shared/dryRun"
import {createVertexEffects, undoOps, type Op, type UndoResult} from "../../shared/effects"
import type {PickOptions, VertexEffects} from "../../shared/vertex"
import type {RunOutcome} from "../api"
import AskModal, {type Ask} from "../components/AskModal.vue"
import TrashModal from "../components/TrashModal.vue"
import TrustModal from "../components/TrustModal.vue"
import {workflowsContext} from "../plugin"
import {language} from "./language"
import {useNotify} from "./notify"
import {useWorkflowManifest} from "./useWorkflowManifest"

export const RUN_EVENT = 'vertex.onManual'

/** A new workflow: On Run, ready to wire. */
export const newWorkflow = (): DocumentV1 => ({
    format: DOCUMENT_FORMAT,
    language: {id: 'vertex', version: 1},
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
    const loaded = migrate(raw, language())
    return 'doc' in loaded ? {doc: loaded.doc, problems: []} : {problems: loaded.diagnostics}
}

/** Where a run starts from. */
export interface RunContext {
    /** The note it runs on, for Current note. */
    note?: string
}

/** What the editor's live run (`editor.run`) passes along: its trace, cancel signal and step control. */
export type LiveOptions = Pick<RunOptions<unknown>, 'onTrace' | 'signal' | 'beforeStep'>

/** A message for a run that couldn't start: the first compile diagnostic, or the error's own. */
export const failureOf = (error: unknown) =>
    error instanceof CompileError ? error.diagnostics[0]?.message ?? error.message : error instanceof Error ? error.message : String(error)

/**
 * Runs workflow documents against a workspace. A dry run executes the same effects over an in-memory overlay;
 * a real run of a workflow outside the trusted folders and files first shows what it can do (§11).
 * Prompts (the `ui` capability) are interactive: their time doesn't count toward the timeout, and dry runs ask
 * too (Appendix A #66). The last real run's ops are kept in memory for undo.
 */
export function useWorkflowRunner(session: SessionContext) {
    const {config, trust} = workflowsContext()
    const vault = session.files.vault()
    const root = session.session.rootPath!
    // Not `useI18n`: chats run workflows outside a component's setup.
    const {t} = useNuxtApp().$i18n
    const notify = useNotify()
    const $toast = useToast()
    const manifest = useWorkflowManifest()
    const overlay = useOverlay()
    const trustModal = overlay.create(TrustModal)
    const trashModal = overlay.create(TrashModal)
    const askModal = overlay.create(AskModal)
    // Frontmatter as Obsidian writes it (the editor package's `frontmatterRange` is auto-imported).
    const yaml = obsidianYaml(frontmatterRange)
    const undoable = shallowRef<Op[]>([])
    const absolute = (path: string) => `${root}/${path}`

    /** The app's side of the `ui` capability for one run. A cancelled prompt faults its node. */
    function uiFor(name: string, dry: boolean, context: RunContext): VertexEffects['ui'] {
        let trashAllowed: Promise<boolean> | undefined
        async function answered<T>(result: Promise<unknown>): Promise<T> {
            const value = await result
            if (value === undefined) throw new Error(t('plugins.workflows.workflow.cancelled'))
            return value as T
        }
        const ask = <T>(question: Ask) => answered<T>(askModal.open({name, ...question}).result)
        const pick = (prompt: string, options: PickOptions) => answered<string[]>(session.files.pick({title: prompt || name, ...options}))
        return {
            askText: (question, initial) => ask({kind: 'text', question, initial}),
            askNumber: (question, initial) => ask({kind: 'number', question, initial}),
            askChoice: (question, choices) => ask({kind: 'choice', question, choices}),
            askYesNo: question => ask({kind: 'yesNo', question}),
            form: (question, fields) => ask({kind: 'form', question, fields}),
            pick,
            async message(text) {
                notify.info(name, text)
            },
            async currentNote() {
                return context.note ?? (await pick(t('plugins.workflows.workflow.whichNote'), {kind: 'file', multiple: false, extensions: 'md'}))[0]!
            },
            async open(path) {
                if (dry) return
                const file = session.index.byPath(absolute(path))
                if (!file || file.isFolder) throw new Error(`"${path}" isn't a file`)
                await session.tabs.open(file.uuid)
            },
            confirmTrash() {
                if (dry || !config.value.confirmTrash) return Promise.resolve(true)
                return (trashAllowed ??= trashModal.open({name}).result.then(Boolean))
            },
        }
    }

    /** Compiles (throws CompileError on any error diagnostic) and dispatches the On Run event. */
    async function execute(doc: DocumentV1, name: string, dry: boolean, context: RunContext, live: LiveOptions = {}): Promise<RunOutcome> {
        const program = compile(doc, language())
        const {maxLoopIterations, maxStackDepth, wallClockTimeoutMs} = config.value
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
     * Asks before a real run of the workflow at `path` (vault-relative), unless its file or folder is trusted
     * (`ctx.trust.allows`). The prompt shows the capabilities, and the dry-run diff when there's one to show: a
     * program that talks to the user (`ui`) isn't dry-run first, or its questions and messages would come before the
     * prompt and again after it.
     */
    async function askTrust(doc: DocumentV1, name: string, path: string): Promise<boolean> {
        const file = absolute(path)
        const hash = await hashProgram(doc)
        if (await trust.allows(file, hash)) return true
        const used = compile(doc, language()).capabilities
        const capabilities = manifest.value.capabilities.filter(c => used.has(c.id))
        const plan = used.has('ui') ? undefined : await dryRun(doc, name)
        const answer = await trustModal.open({name, capabilities, plan, file, root}).result
        if (!answer) return false
        if (answer.kind === 'file') await trust.trustFile(file, hash)
        // What's running may be ahead of the disk (unsaved edits); pin that, the program the user just trusted.
        else await trust.trustFolder(answer.path, answer.nested, {file, hash})
        return true
    }

    // In order, so each edit's `before` is the previous edit's `after`.
    let following = Promise.resolve()
    /** An edit made in Vertex's workflow editor carries the file's trust to the new program (`ctx.trust.followEdit`). */
    function followEdit(path: string, before: DocumentV1 | undefined, after: DocumentV1) {
        following = following.then(async () => {
            await trust.followEdit(absolute(path), before && await hashProgram(before), await hashProgram(after))
        }).catch(error => console.error('[workflows] keeping trust after an edit:', error))
    }

    /** `undefined` when the user declined to trust the workflow. Call `askTrust` first to ask outside a live run. */
    async function run(doc: DocumentV1, name: string, path: string, context: RunContext = {}, live?: LiveOptions): Promise<RunOutcome | undefined> {
        if (!await askTrust(doc, name, path)) return undefined
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
        const prefix = dry ? `${t('plugins.workflows.workflow.dryRun')} · ` : ''
        const ok = result.status === 'ok'
        $toast.add({
            title: `${name}: ${prefix}${ok ? t('plugins.workflows.workflow.ok', {steps: result.steps}) : result.status === 'aborted' ? t('plugins.workflows.workflow.aborted') : t('plugins.workflows.workflow.fault', {code: result.fault?.code ?? ''})}`,
            description: result.fault?.message ?? t(dry ? 'plugins.workflows.workflow.wouldChangeCount' : 'plugins.workflows.workflow.changedCount', {count: ops.length}),
            color: ok ? 'success' : 'error',
            icon: ok ? 'i-lucide-circle-check' : 'i-lucide-octagon-alert',
            ...(!dry && ops.length && {
                actions: [{
                    label: t('plugins.workflows.workflow.undo'),
                    icon: 'i-lucide-undo-2',
                    color: 'neutral' as const,
                    variant: 'outline' as const,
                    onClick: async () => {
                        const undone = await undo()
                        notify.success(t('plugins.workflows.workflow.undone', {count: undone.undone}))
                    },
                }],
            }),
        })
    }

    /**
     * Runs the `.workflow` file at `path` (vault-relative): for real (asking for trust; `undefined` when declined,
     * reported in a toast) or dry. Throws a plain `Error` for a file that isn't a valid workflow or doesn't compile.
     */
    async function runPath(path: string, dry: boolean, context: RunContext = {}) {
        const name = baseNameOf(path).replace(/\.workflow$/i, '')
        const {doc, problems} = parseWorkflow(await vault.read(path))
        if (!doc) throw new Error(problems[0]?.message ?? t('plugins.workflows.workflow.invalid'))
        try {
            const outcome = dry ? await dryRun(doc, name, context) : await run(doc, name, path, context)
            if (outcome && !dry) report(name, outcome)
            return outcome
        } catch (error) {
            throw new Error(failureOf(error), {cause: error})
        }
    }

    /** `runPath` from a menu (file tree, command palette, a note's menu): a dry run reported too, failures toasted. */
    async function runFile(path: string, dry: boolean, context: RunContext = {}) {
        try {
            const outcome = await runPath(path, dry, context)
            if (!outcome) return notify.info(t('plugins.workflows.workflow.declined'))
            if (dry) report(baseNameOf(path).replace(/\.workflow$/i, ''), outcome)
        } catch (error) {
            notify.error(t('plugins.workflows.workflow.failed'), failureOf(error))
        }
    }

    return {dryRun, askTrust, followEdit, run, runPath, runFile, report, undo, canUndo: computed(() => undoable.value.length > 0)}
}

export type WorkflowRunner = ReturnType<typeof useWorkflowRunner>
