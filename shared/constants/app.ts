/**
 * Single source for window labels, routes and `useState` keys.
 * Tauri's own `tauri://*` events come from `TauriEvent` in `@tauri-apps/api/event`; Rust commands/events
 * are named in app/utils/stateClient.ts. Window labels are mirrored by MAIN_WINDOW / SESSION_WINDOW_PREFIX
 * in src-tauri/src/lib.rs; keep both in sync.
 */

export const WindowLabel = {
    main: 'main',
    settings: 'settings',
    about: 'about',
    sessionPrefix: 'session-',
} as const

export function sessionWindowLabel(sessionUuid: string) {
    return `${WindowLabel.sessionPrefix}${sessionUuid}`
}

export function sessionUuidFromLabel(label: string): string | undefined {
    return label.startsWith(WindowLabel.sessionPrefix) ? label.slice(WindowLabel.sessionPrefix.length) : undefined
}

export type SessionMode = 'workspace' | 'singlespace'

export const Routes = {
    home: '/',
    loading: '/loading',
    settings: '/settings',
    about: '/about',
    error: '/error',
    sessionTabs: (sessionUuid: string, mode: SessionMode) => `/sessions/${sessionUuid}/${mode}/tabs`,
    sessionTab: (sessionUuid: string, mode: SessionMode, fileUuid: string) => `/sessions/${sessionUuid}/${mode}/tabs/${fileUuid}`,
} as const

/** Keys for Nuxt `useState`. Session-scoped keys require a real session uuid; never fall back to a random one. */
export const StateKey = {
    activeSessions: 'active.sessions',
    appSessions: 'app.sessions',
    currentAppSession: 'app.sessions.current',
    settings: 'settings.data',
    settingsLoaded: 'settings.is_loaded',
    tabs: (s: string) => `active.tabs.${s}`,
    activeTab: (s: string) => `active.tabs.uuid.${s}`,
    tabContent: (s: string, f: string) => `active.tabs.currentTab.${s}.${f}.content`,
    tabScrollToNode: (s: string, f: string) => `active.tabs.currentTab.${s}.${f}.scroll-to-node`,
    leftPanel: (s: string) => `active.layouts.left-panel.${s}`,
    rightPanel: (s: string) => `active.layouts.right-panel.${s}`,
    workspaceIndex: (s: string) => `active.workspace.indexMap.${s}`,
    workspaceUuidToPath: (s: string) => `active.workspace.uuidToFilePathIndexMap.${s}`,
    singlespaceIndex: (s: string) => `active.singlespace.indexMap.${s}`,
    expandedFolders: (s: string) => `active.workspace.expanded-file-tree-items-${s}`,
    activeTreeItem: (s: string) => `active.workspace.active-tree-item-${s}`,
    fileTreeLabels: (s: string) => `active.workspace.${s}.processed-file-labels`,
} as const

/**
 * Resolves the uuid used to scope per-session state. A missing session is a bug in the caller
 * (composable used before the ActiveSession exists); it is reported and mapped to one fixed key
 * instead of a fresh random uuid, so the bug is visible and state never silently splits.
 */
export function sessionScope(session: { uuid: string } | undefined | null, owner: string): string {
    if (session?.uuid) return session.uuid
    console.error(`[${owner}] called without an active session`)
    return '__missing-session__'
}
