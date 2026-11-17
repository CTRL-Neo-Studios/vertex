/**
 * The workflows plugin's API (`ctx.use('workflows')`): run a vault's workflows, and add nodes to their language.
 */
import type {RunResult} from '@type32/workflows/core'
import type {Op} from '../shared/effects'
import type {VertexExtension} from '../shared/vertex'

export type {VertexExtension}

export interface RunOutcome {
    dry: boolean
    result: RunResult
    /** What changed, or for a dry run what would change. */
    ops: Op[]
}

export type {VertexBuilder, VertexEffects, VertexValues} from '../shared/vertex'

export interface WorkflowsApi {
    /**
     * Runs the `.workflow` file at `path` (workspace-relative) in this window's workspace, `note` for Current note:
     * asks for trust when it isn't trusted (`undefined` when declined), and reports in a toast with Undo. Throws a
     * plain `Error` for a file that isn't a valid workflow or doesn't compile.
     */
    run(path: string, options?: { note?: string }): Promise<RunOutcome | undefined>
    /** The same run over an in-memory copy: what it would change, nothing written. */
    dryRun(path: string, options?: { note?: string }): Promise<RunOutcome>
    /**
     * Adds to Vertex's language (`language.node({…})`, `.category`, `.type`), typed with its effects (`index`, `fs`,
     * `ui`) and its types (`vertex.Note`…). One that doesn't build is left out (logged). Removed like a registration.
     */
    registerNodes(extension: VertexExtension): () => void
}

declare module '#shared/plugin/api' {
    interface PluginApis {
        workflows: WorkflowsApi
    }
}
