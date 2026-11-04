import {invoke} from "@tauri-apps/api/core"
import {hashProgram} from "@type32/workflows/core"
import {getFileExtensionFromPath, isWorkflowFile} from "#shared/utils/fs/filenames"
import {defaultTrustRecords, normalizeTrustPath, type TrustRecords} from "#shared/workflows/trust"
import {parseWorkflow} from "~/composables/workflows/useWorkflowRunner"
import {stateClient} from "~/utils/stateClient"

/**
 * The program of each workflow a folder covers right now (its own files, or with `nested` everything under it):
 * what trusting the folder means in content mode. Hidden entries (`.vertex/`) are skipped by the scan; files that
 * don't load as workflows aren't pinned, so they ask when they run.
 */
async function pinsUnder(folder: string, nested: boolean): Promise<Record<string, string>> {
    const entries = await invoke<{path: string, name: string, is_directory: boolean}[]>('scan_directory_recursive', {rootPath: folder})
    const paths = entries
        .filter(e => !e.is_directory && isWorkflowFile(getFileExtensionFromPath(e.name)))
        .map(e => normalizeTrustPath(e.path))
        .filter(path => nested || path.slice(0, path.lastIndexOf('/')) === folder)
    const read = await invoke<{path: string, content?: string}[]>('read_text_files_batch', {paths})
    const pins: Record<string, string> = {}
    for (const {path, content} of read) {
        const doc = content === undefined ? undefined : parseWorkflow(content).doc
        if (doc) pins[normalizeTrustPath(path)] = await hashProgram(doc)
    }
    return pins
}

/**
 * Per-window mirror of the trusted workflow folders and files. Rust (`state.rs`) owns `trust.json`, changes one
 * entry per call and broadcasts the result, so a revoke in one window reaches every other before its next run.
 */
export function useWorkflowTrust() {
    const records = useState<TrustRecords>('workflowTrust', () => defaultTrustRecords())
    const loading = useState<Promise<void> | null>('workflowTrustLoading', () => null)

    /** Loads once per window and subscribes to changes; later calls wait for the first. */
    function load() {
        return (loading.value ??= (async () => {
            await stateClient.onTrustChanged(raw => records.value = defaultTrustRecords(raw))
            records.value = defaultTrustRecords(await stateClient.getTrust())
        })())
    }

    /** Trusts a folder as its workflows are now; again (subfolders switched on, say) pins them afresh. */
    async function trustFolder(path: string, nested: boolean, trustedAt = new Date().toISOString()) {
        const folder = normalizeTrustPath(path)
        await stateClient.setTrust('folders', folder, {trustedAt, nested, files: await pinsUnder(folder, nested)})
    }

    return {
        records,
        load,
        trustFolder,
        trustFile: (path: string, hash: string) =>
            stateClient.setTrust('files', normalizeTrustPath(path), {trustedAt: new Date().toISOString(), hash}),
        revoke: (kind: keyof TrustRecords, path: string) => stateClient.setTrust(kind, path, null),
        revokeAll: () => stateClient.clearTrust(),
    }
}
