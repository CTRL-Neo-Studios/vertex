import {shallowReactive} from "vue"
import {readTextFile} from "@tauri-apps/plugin-fs"
import {vertexInvoke} from "~/utils/vertexInvoke"
import {getFileExtensionFromPath} from "#shared/utils/fs/filenames"
import {coveringFolder, defaultTrustRecords, normalizeTrustPath, trustedBy, type TrustRecords} from "#shared/utils/trust"
import type {TrustedFormatDef} from "#shared/plugin/api"
import {useAppSettings} from "~/composables/app/useAppSettings"
import {stateClient} from "~/utils/stateClient"

/** The kinds of file whose content trust pins (`ctx.trust.format`: the workflows plugin's programs). Reactive for Settings → Trust. */
const trustedFormats = shallowReactive(new Set<TrustedFormatDef>())

/** Adds a format a folder's trust pins; returns its removal. */
export function registerTrustedFormat(format: TrustedFormatDef): () => void {
    trustedFormats.add(format)
    return () => void trustedFormats.delete(format)
}

const formatOf = (name: string) => {
    const ext = getFileExtensionFromPath(name)
    return [...trustedFormats].find(f => f.extensions.includes(ext))
}

/**
 * What trusting a folder means in content mode: the hash of each file of a trusted format it covers right now (its own
 * files, or with `nested` everything under it). Hidden entries (`.vertex/`) are skipped by the scan.
 */
async function pinsUnder(folder: string, nested: boolean): Promise<Record<string, string>> {
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
 * Per-window mirror of the trusted folders and files, and the rules a program from a vault runs by (`ctx.trust`).
 * Rust (`state.rs`) owns `trust.json`, changes one entry per call and broadcasts the result, so a revoke in one window
 * reaches every other before its next run.
 */
export function useTrust() {
    const records = useState<TrustRecords>('workflowTrust', () => defaultTrustRecords())
    const loading = useState<Promise<void> | null>('workflowTrustLoading', () => null)
    const {config} = useAppSettings()
    const mode = () => config.value?.trustConfig.fileTrust ?? 'content'

    /** Loads once per window and subscribes to changes; later calls wait for the first. */
    function load() {
        return (loading.value ??= (async () => {
            await stateClient.onTrustChanged(raw => records.value = defaultTrustRecords(raw))
            records.value = defaultTrustRecords(await stateClient.getTrust())
        })())
    }

    /**
     * Trusts a folder as its programs are now; again (subfolders switched on, say) pins them afresh. `pin`: a program
     * running now, which may be ahead of the disk (unsaved edits): the one the user just trusted.
     */
    async function trustFolder(path: string, nested: boolean, {trustedAt = new Date().toISOString(), pin}: {trustedAt?: string, pin?: {file: string, hash: string}} = {}) {
        const folder = normalizeTrustPath(path)
        await stateClient.setTrust('folders', folder, {trustedAt, nested, files: await pinsUnder(folder, nested)})
        if (pin) await stateClient.pinTrust(folder, normalizeTrustPath(pin.file), pin.hash)
    }

    /**
     * Whether the program `hash` at `path` may run without asking: its file is trusted, or a covering folder (in
     * content mode, each with this program). There, a file record or folder pin holding another program was changed
     * outside Vertex (edits in Vertex carry trust, `followEdit`), so it's dropped.
     */
    async function allows(path: string, hash: string) {
        await load()
        const file = normalizeTrustPath(path)
        if (trustedBy(records.value, file, hash, mode())) return true
        if (mode() === 'content') {
            if (records.value.files[file]) await stateClient.setTrust('files', file, null)
            const folder = coveringFolder(records.value, file)
            if (folder && records.value.folders[folder]!.files[file]) await stateClient.pinTrust(folder, file, null)
        }
        return false
    }

    /**
     * An edit made in Vertex: a file trusted (or pinned by a folder) with the program it had before keeps its trust
     * with the new one; Rust swaps the hash only if it matches, so a file changed elsewhere first stays untrusted. A
     * new file (`before` undefined) in a trusted folder gets its first program pinned: that one comes from the user.
     */
    async function followEdit(path: string, before: string | undefined, after: string) {
        const file = normalizeTrustPath(path)
        if (before === undefined) {
            await load()
            const folder = coveringFolder(records.value, file)
            if (folder) await stateClient.pinTrust(folder, file, after)
        } else if (before !== after) {
            await stateClient.followTrustEdit(file, before, after)
        }
    }

    /** The program hash of the file at `path` by its format; `undefined` when no format takes it or it doesn't load. */
    async function hashOf(path: string) {
        return formatOf(path)?.hash(await readTextFile(path))
    }

    return {
        records,
        load,
        trustFolder,
        allows,
        followEdit,
        hashOf,
        /** The extensions of the registered formats, for picking a file to trust. */
        formatExtensions: () => [...trustedFormats].flatMap(f => f.extensions),
        trustFile: (path: string, hash: string) =>
            stateClient.setTrust('files', normalizeTrustPath(path), {trustedAt: new Date().toISOString(), hash}),
        revoke: (kind: keyof TrustRecords, path: string) => stateClient.setTrust(kind, path, null),
        revokeAll: () => stateClient.clearTrust(),
    }
}

/** A window's trust, as `useTrust` gives it (the host passes it on as `ctx.trust`). */
export type WindowTrust = ReturnType<typeof useTrust>
