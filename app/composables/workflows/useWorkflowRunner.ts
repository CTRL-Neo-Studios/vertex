import {compile, hashProgram, type CapabilityDef, type DocumentV1, type RunResult, type TraceEvent} from "@type32/workflows/core"
import type {ActiveSession} from "#shared/types/active/sessions"
import {defaultAppWorkflowConfig} from "#shared/utils/defaults/apps"
import {overlayVault} from "#shared/workflows/dryRun"
import {createVertexEffects, undoOps, type Op, type UndoResult} from "#shared/workflows/effects"
import type {Vault, YamlTools} from "#shared/workflows/vault"
import {vertexLanguage} from "#shared/workflows/vertex"
import WorkflowTrashModal from "~/components/Modals/WorkflowTrashModal.vue"
import WorkflowTrustModal from "~/components/Modals/WorkflowTrustModal.vue"
import {useAppSettings} from "~/composables/app/useAppSettings"
import {useWorkspaceVault} from "~/composables/workflows/useWorkspaceVault"

export const RUN_EVENT = 'vertex.onManual'

export interface RunOutcome {
    dry: boolean
    result: RunResult
    /** What changed, or for a dry run what would change. */
    ops: Op[]
    trace: TraceEvent[]
}

/**
 * Runs workflow documents against a workspace. A dry run executes the same effects over an in-memory overlay;
 * a real run of a program whose hash isn't trusted yet first shows its capabilities and dry-run diff (§11).
 * The last real run's ops are kept in memory for undo.
 */
export function useWorkflowRunner(session: ActiveSession) {
    const vault = useWorkspaceVault(session)
    const {config, save} = useAppSettings()
    const trustModal = useOverlay().create(WorkflowTrustModal)
    const trashModal = useOverlay().create(WorkflowTrashModal)
    // The editor package's helpers, auto-imported.
    const yaml: YamlTools = {frontmatterRange, parseYaml, stringifyYaml}
    const undoable = shallowRef<Op[]>([])

    const settings = () => config.value?.workflowConfig ?? defaultAppWorkflowConfig()

    /** Compiles (throws CompileError on any error diagnostic) and dispatches the On Run event. */
    async function execute(doc: DocumentV1, target: Vault, dry: boolean, confirmTrash?: () => Promise<boolean>): Promise<RunOutcome> {
        const program = compile(doc, vertexLanguage)
        const {maxLoopIterations, maxStackDepth, wallClockTimeoutMs} = settings()
        const runId = new Date().toISOString().replace(/[:.]/g, '-')
        const {effects, ops} = createVertexEffects(target, {yaml, runId, ...(confirmTrash && {confirmTrash})})
        const trace: TraceEvent[] = []
        const result = await program.dispatch(RUN_EVENT, undefined, {
            effects,
            limits: {steps: maxLoopIterations, depth: maxStackDepth, ...(wallClockTimeoutMs > 0 && {timeoutMs: wallClockTimeoutMs})},
            trace: 'values',
            onTrace: e => trace.push(e),
        })
        return {dry, result, ops, trace}
    }

    const dryRun = (doc: DocumentV1) => execute(doc, overlayVault(vault, yaml), true)

    /** `undefined` when the user declined to trust the program. */
    async function run(doc: DocumentV1, name: string): Promise<RunOutcome | undefined> {
        const hash = await hashProgram(doc)
        const current = settings()
        if (!current.trustedPrograms[hash]) {
            const plan = await dryRun(doc)
            const used = compile(doc, vertexLanguage).capabilities
            const capabilities: CapabilityDef[] = vertexLanguage.manifest.capabilities.filter(c => used.has(c.id))
            const accepted = await trustModal.open({name, capabilities, plan}).result
            if (!accepted) return undefined
            await save({workflowConfig: {...current, trustedPrograms: {...current.trustedPrograms, [hash]: {name, trustedAt: new Date().toISOString()}}}})
        }
        const confirmTrash = settings().confirmTrash ? async () => Boolean(await trashModal.open({name}).result) : undefined
        const outcome = await execute(doc, vault, false, confirmTrash)
        undoable.value = outcome.ops
        return outcome
    }

    async function undo(): Promise<UndoResult> {
        const result = await undoOps(vault, undoable.value)
        undoable.value = []
        return result
    }

    return {dryRun, run, undo, canUndo: computed(() => undoable.value.length > 0)}
}
