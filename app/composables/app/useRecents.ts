import {exists} from "@tauri-apps/plugin-fs";
import type {AppSession} from "#shared/types/app/sessions";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";

/** One recent workspace or file. */
export interface RecentEntry {
    session: AppSession
    name: string
    path: string
    /** Its folder or file is gone (checked whenever the list changes). */
    missing: boolean
}

/**
 * Recent workspaces and files (the sessions Rust keeps): pinned first, then the most recently opened or closed. Shared by
 * the start page and the workspace switcher.
 */
export function useRecents() {
    const $sessions = useAppSessions()
    const $act = useAppSessionActions()

    const missing = ref(new Set<string>())
    // Joined: sessions change on every tab change, the paths rarely.
    watch(() => $sessions.appSessions.value.map(s => s.rootFileOrFolderAbsolutePath ?? '').join('\n'), async joined => {
        const gone = await Promise.all(joined.split('\n').map(async p => p && !(await exists(p).catch(() => false)) ? p : ''))
        missing.value = new Set(gone.filter(Boolean))
    }, {immediate: true})

    const entries = computed<RecentEntry[]>(() => $sessions.appSessions.value
        .filter(s => s.rootFileOrFolderAbsolutePath)
        .map(s => ({session: s, name: fileNameFromPath(s.rootFileOrFolderAbsolutePath!), path: s.rootFileOrFolderAbsolutePath!, missing: missing.value.has(s.rootFileOrFolderAbsolutePath!)}))
        // Stable: the list is newest first already.
        .sort((a, b) => Number(!!b.session.pinned) - Number(!!a.session.pinned)))

    return {
        workspaces: computed(() => entries.value.filter(e => e.session.sessionType === 'workspace')),
        files: computed(() => entries.value.filter(e => e.session.sessionType === 'singlespace')),
        /** Opens it, or brings its window forward; a missing one says so (with Remove). */
        open: (e: RecentEntry) => e.session.sessionType === 'workspace' ? $act.openWorkspaceFromPath(e.path) : $act.openSinglespaceFromPath(e.path),
        setPinned: (e: RecentEntry, pinned: boolean) => $sessions.updateAppSession(e.session.uuid, {pinned}),
        /** Drops it from recents (and what it would restore). Not for an open one. */
        remove: (e: RecentEntry) => e.session.open ? undefined : $sessions.removeAppSession(e.session.uuid),
    }
}
