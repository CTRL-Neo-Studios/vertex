import {vertexInvoke} from "~/utils/vertexInvoke"
import {getFileExtensionFromPath} from "#shared/utils/fs/filenames"
import {defaultTrustRecords, normalizeTrustPath, type TrustRecords} from "#shared/utils/trust"
import {stateClient} from "~/utils/stateClient"

/**
 * A kind of file whose content trust pins (a workflow's program): trusting a folder in content mode trusts each such
 * file as it is now. `hash` is `undefined` for a file that doesn't load, which isn't pinned and asks when it runs.
 */
export interface TrustedFormat {
    match(extension: string): boolean
    hash(text: string): Promise<string | undefined>
}

const trustedFormats = new Set<TrustedFormat>()

/** Adds a format a folder's trust pins (the workflows builtin's programs); returns its removal. */
export function registerTrustedFormat(format: TrustedFormat): () => void {
    trustedFormats.add(format)
    return () => void trustedFormats.delete(format)
}

/**
 * What trusting a folder means in content mode: the hash of each file of a trusted format it covers right now (its own
 * files, or with `nested` everything under it). Hidden entries (`.vertex/`) are skipped by the scan.
 */
async function pinsUnder(folder: string, nested: boolean): Promise<Record<string, string>> {
    const formatOf = (name: string) => {
        const ext = getFileExtensionFromPath(name)
        return [...trustedFormats].find(f => f.match(ext))
    }
    const entries = await vertexInvoke<{path: string, name: string, is_directory: boolean}[]>('scan_directory_recursive', {rootPath: folder})
    const paths = entries
        .filter(e => !e.is_directory && formatOf(e.name))
        .map(e => normalizeTrustPath(e.path))
        .filter(path => nested || path.slice(0, path.lastIndexOf('/')) === folder)
    const read = await vertexInvoke<{path: string, content?: string}[]>('read_text_files_batch', {paths})
    const pins: Record<string, string> = {}
    for (const {path, content} of read) {
        const hash = content === undefined ? undefined : await formatOf(path)?.hash(content)
        if (hash) pins[normalizeTrustPath(path)] = hash
    }
    return pins
}

/**
 * Per-window mirror of the trusted folders and files. Rust (`state.rs`) owns `trust.json`, changes one
 * entry per call and broadcasts the result, so a revoke in one window reaches every other before its next run.
 */
export function useTrust() {
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
