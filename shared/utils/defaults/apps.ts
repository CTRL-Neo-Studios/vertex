import type {AppFileConfig, AppGitConfig, AppPluginsConfig, AppSettings, AppTrustConfig, AppViewConfig, HeaderToolsPosition, SessionRecoveryMode} from "#shared/types/app/settings";
import type {AppSession, AppSessionContext, SavedTab} from "#shared/types/app/sessions";
import {defaultAppAdvancedThemeConfig, defaultAppThemeConfig} from "#shared/utils/defaults/themes";
import {isPanelViewId, normalizePanelLayout} from "#shared/utils/panelLayout";
import {withMovedPaths} from "#shared/utils/settings/legacy";
import type {DeepPartial} from "#shared/types/types";

const RECOVERY_MODES: readonly SessionRecoveryMode[] = ['none', 'workspaces', 'singlespaces', 'both']
const HEADER_TOOLS_POSITIONS: readonly HeaderToolsPosition[] = ['left', 'right', 'hidden']

const headerToolsPosition = (value: unknown, fallback: HeaderToolsPosition) =>
    HEADER_TOOLS_POSITIONS.includes(value as HeaderToolsPosition) ? value as HeaderToolsPosition : fallback

/** Settings written before `recoverSessions` existed only had `openLastOpenedWindows`, which recovered workspaces. */
type LegacySettings = DeepPartial<AppSettings> & { openLastOpenedWindows?: boolean }

export function defaultAppSettings(raw?: LegacySettings): AppSettings {
    // Settings that moved (`LEGACY_PATHS`) are read at their new paths, and written there with the next save.
    const data = withMovedPaths(raw)
    const recoverSessions = RECOVERY_MODES.includes(data?.recoverSessions as SessionRecoveryMode)
        ? data!.recoverSessions as SessionRecoveryMode
        : data?.openLastOpenedWindows ? 'workspaces' : 'none'
    return {
        recoverSessions,
        language: data?.language || 'system',
        themeConfig: defaultAppThemeConfig(data?.themeConfig),
        advancedThemeConfig: defaultAppAdvancedThemeConfig(data?.advancedThemeConfig),
        viewConfig: defaultAppViewConfig(data?.viewConfig),
        trustConfig: defaultAppTrustConfig(data?.trustConfig),
        gitConfig: defaultAppGitConfig(data?.gitConfig),
        fileConfig: defaultAppFileConfig(data?.fileConfig),
        plugins: defaultAppPluginsConfig(data?.plugins),
		deviceId: data?.deviceId || crypto.randomUUID(),
        updateChannel: data?.updateChannel || 'stable'
    } satisfies AppSettings
}

const UPDATE_LINKS: readonly AppFileConfig['updateLinks'][] = ['ask', 'update', 'keep']
const DELETED_FILES: readonly AppFileConfig['deletedFiles'][] = ['trash', 'workspaceTrash', 'permanent']

export function defaultAppFileConfig(data?: DeepPartial<AppFileConfig>): AppFileConfig {
    return {
        updateLinks: UPDATE_LINKS.includes(data?.updateLinks as AppFileConfig['updateLinks']) ? data!.updateLinks! : 'ask',
        attachmentsFolder: typeof data?.attachmentsFolder === 'string' ? data.attachmentsFolder.replace(/^\/+|\/+$/g, '') : 'Attachments',
        importToChat: data?.importToChat === 'always' ? 'always' : 'ask',
        deletedFiles: DELETED_FILES.includes(data?.deletedFiles as AppFileConfig['deletedFiles']) ? data!.deletedFiles! : 'trash',
    }
}

/**
 * Keeps every plugin's on/off, config and source, known here or not (a vault's plugin, or one installed on another
 * device only). A plugin's config is checked against its schema when it runs (`pluginConfig`), not here.
 */
export function defaultAppPluginsConfig(data?: DeepPartial<AppPluginsConfig>): AppPluginsConfig {
    const entries = (value: unknown) => Object.entries(isLoose(value) ? value : {})
    return {
        enabled: Object.fromEntries(entries(data?.enabled).filter((e): e is [string, boolean] => typeof e[1] === 'boolean')),
        config: Object.fromEntries(entries(data?.config).filter(([, c]) => isLoose(c))),
        sources: Object.fromEntries(entries(data?.sources).filter((e): e is [string, string] => typeof e[1] === 'string')),
    }
}

type Loose = Record<string, unknown>
const isLoose = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)

export function defaultAppTrustConfig(data?: DeepPartial<AppTrustConfig>): AppTrustConfig {
    return {fileTrust: data?.fileTrust === 'path' ? 'path' : 'content'}
}

export function defaultAppGitConfig(data?: DeepPartial<AppGitConfig>): AppGitConfig {
    const interval = data?.autoSync?.interval
    return {
        path: typeof data?.path === 'string' ? data.path : '',
        autoSync: {
            interval: typeof interval === 'number' && Number.isFinite(interval) && interval > 0 ? interval : 0,
            onOpen: data?.autoSync?.onOpen === true,
            pullOnFocus: data?.autoSync?.pullOnFocus === true,
        },
    }
}

/** Old sessions kept absolute paths (Rust migrates the rest, see `sanitize_sessions`); read them too. */
type LegacySession = Omit<Partial<AppSession>, 'context'> & {context?: LegacyContext}
type LegacyContext = Partial<AppSessionContext> & {
    openedAbsoluteFilePaths?: string[],
    openedAbsoluteFolderPaths?: string[],
    lastFocusedAbsoluteFilePath?: string,
    /** Before split panes: one view per side, now `shownPanelViews`. */
    leftPanelView?: string,
    rightPanelView?: string,
    /** Before tab kinds: chat and view tabs, now `openedTabs` (kinds `chat` and `view`) and `lastFocusedTab`. */
    openedChatIds?: string[],
    lastFocusedChatId?: string,
    openedViewIds?: string[],
    lastFocusedViewId?: string,
}

export function defaultAppSession(data?: LegacySession): AppSession {
    const root = data?.rootFileOrFolderAbsolutePath || ''
    return {
        uuid: data?.uuid || crypto.randomUUID(),
        sessionType: data?.sessionType || 'workspace',
        rootFileOrFolderAbsolutePath: root,
        context: defaultAppSessionContext(data?.context, root),
        open: data?.open === true,
        ...(data?.reopen === true && {reopen: true}),
        lastOpened: typeof data?.lastOpened === 'number' ? data.lastOpened : 0,
        ...(data?.pinned === true && {pinned: true}),
    } satisfies AppSession
}

const panelViews = (current: unknown, legacy: unknown[]) => (Array.isArray(current) ? current : legacy).filter(isPanelViewId)

/** A saved tab as `{kind, id}`, when both are non-empty strings. */
function savedTab(value: unknown): SavedTab | undefined {
    const {kind, id} = (value ?? {}) as Partial<Record<keyof SavedTab, unknown>>
    return typeof kind === 'string' && kind && typeof id === 'string' && id ? {kind, id} : undefined
}

/** `root`: the workspace root, to turn old absolute paths into relative ones (the index's `relativePath`); others are dropped. */
export function defaultAppSessionContext(data?: LegacyContext, root = ''): AppSessionContext {
    const relative = (path: string) => root && path.length > root.length && path.startsWith(root) && /[\\/]/.test(path[root.length]!)
        ? path.slice(root.length + 1)
        : undefined
    const paths = (current: string[] | undefined, legacy: string[] | undefined) =>
        current ?? (legacy ?? []).map(relative).filter((p): p is string => !!p)
    // Before tab kinds, chat and view tabs had their own fields: chats first, then views (well-formed view ids only).
    const tabs: unknown[] = Array.isArray(data?.openedTabs) ? data.openedTabs : [
        ...(Array.isArray(data?.openedChatIds) ? data.openedChatIds : []).map(id => ({kind: 'chat', id})),
        ...panelViews(data?.openedViewIds, []).map(id => ({kind: 'view', id})),
    ]
    const focused = Array.isArray(data?.openedTabs) ? data.lastFocusedTab
        : data?.lastFocusedChatId ? {kind: 'chat', id: data.lastFocusedChatId}
            : isPanelViewId(data?.lastFocusedViewId) ? {kind: 'view', id: data.lastFocusedViewId}
                : undefined
    return {
        openedFilePaths: paths(data?.openedFilePaths, data?.openedAbsoluteFilePaths),
        openedFolderPaths: paths(data?.openedFolderPaths, data?.openedAbsoluteFolderPaths),
        lastFocusedFilePath: data?.lastFocusedFilePath ?? (data?.lastFocusedAbsoluteFilePath && relative(data.lastFocusedAbsoluteFilePath)),
        openedTabs: tabs.flatMap(tab => savedTab(tab) ?? []),
        lastFocusedTab: savedTab(focused),
        shownPanelViews: panelViews(data?.shownPanelViews, [data?.leftPanelView, data?.rightPanelView]),
        leftPanelCollapsed: data?.leftPanelCollapsed === true,
        rightPanelCollapsed: data?.rightPanelCollapsed !== false,
        bottomPanelCollapsed: data?.bottomPanelCollapsed === true,
    } satisfies AppSessionContext
}

export function defaultAppViewConfig(data?: DeepPartial<AppViewConfig>): AppViewConfig {
    return {
        editorPanel: {
            showStatusBar: data?.editorPanel?.showStatusBar || 'always-shown',
            selectionToolbar: data?.editorPanel?.selectionToolbar ?? true,
            slashMenu: data?.editorPanel?.slashMenu ?? true,
            blockHandle: data?.editorPanel?.blockHandle ?? true,
            headerHistory: headerToolsPosition(data?.editorPanel?.headerHistory, 'left'),
            headerFormatting: headerToolsPosition(data?.editorPanel?.headerFormatting, 'right'),
        },
        panels: {
            style: data?.panels?.style === 'strip' ? 'strip' : 'buttons',
            ...normalizePanelLayout(data?.panels),
        },
    } satisfies AppViewConfig
}
