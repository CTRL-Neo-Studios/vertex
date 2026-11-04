import {defaultTrustRecords, normalizeTrustPath, type TrustRecords} from "#shared/workflows/trust"
import {stateClient} from "~/utils/stateClient"

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

    return {
        records,
        load,
        trustFile: (path: string, hash: string) =>
            stateClient.setTrust('files', normalizeTrustPath(path), {trustedAt: new Date().toISOString(), hash}),
        /** `trustedAt` is kept when only `nested` changes. */
        trustFolder: (path: string, nested: boolean, trustedAt = new Date().toISOString()) =>
            stateClient.setTrust('folders', normalizeTrustPath(path), {trustedAt, nested}),
        revoke: (kind: keyof TrustRecords, path: string) => stateClient.setTrust(kind, path, null),
        revokeAll: () => stateClient.clearTrust(),
    }
}
