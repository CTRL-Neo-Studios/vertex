import type {AppSettings, AppViewConfig, AppWorkflowConfig, HeaderToolsPosition, SessionRecoveryMode} from "#shared/types/app/settings";
import type {AiModelInfo, AiModelProfile, AiProviderProfile, AppAiConfig} from "#shared/types/app/ai";
import type {ChatMode} from "#shared/types/app/chats";
import type {AppSession, AppSessionContext} from "#shared/types/app/sessions";
import {defaultAppAdvancedThemeConfig, defaultAppThemeConfig} from "#shared/utils/defaults/themes";
import {isPanelViewId, normalizePanelLayout} from "#shared/utils/panelLayout";
import {sanitizeModelParams} from "#shared/utils/aiParams";
import type {DeepPartial} from "#shared/types/types";

const RECOVERY_MODES: readonly SessionRecoveryMode[] = ['none', 'workspaces', 'singlespaces', 'both']
const HEADER_TOOLS_POSITIONS: readonly HeaderToolsPosition[] = ['left', 'right', 'hidden']

const headerToolsPosition = (value: unknown, fallback: HeaderToolsPosition) =>
    HEADER_TOOLS_POSITIONS.includes(value as HeaderToolsPosition) ? value as HeaderToolsPosition : fallback

/** Settings written before `recoverSessions` existed only had `openLastOpenedWindows`, which recovered workspaces. */
type LegacySettings = DeepPartial<AppSettings> & { openLastOpenedWindows?: boolean }

export function defaultAppSettings(data?: LegacySettings): AppSettings {
    const recoverSessions = RECOVERY_MODES.includes(data?.recoverSessions as SessionRecoveryMode)
        ? data!.recoverSessions as SessionRecoveryMode
        : data?.openLastOpenedWindows ? 'workspaces' : 'none'
    return {
        recoverSessions,
        language: data?.language || 'system',
        themeConfig: defaultAppThemeConfig(data?.themeConfig),
        advancedThemeConfig: defaultAppAdvancedThemeConfig(data?.advancedThemeConfig),
        viewConfig: defaultAppViewConfig(data?.viewConfig),
        workflowConfig: defaultAppWorkflowConfig(data?.workflowConfig),
        aiConfig: defaultAppAiConfig(data?.aiConfig),
		deviceId: data?.deviceId || crypto.randomUUID(),
        updateChannel: data?.updateChannel || 'stable'
    } satisfies AppSettings
}

const positiveInt = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback

type Loose = Record<string, unknown>
const isLoose = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : undefined)
/** Objects with a non-empty string `id`, first of each id kept, each mapped by `fn`. */
const byId = <T>(v: unknown, fn: (o: Loose & {id: string}) => T): T[] => {
    const seen = new Set<string>()
    return (Array.isArray(v) ? v : []).flatMap(o => {
        if (!isLoose(o) || typeof o.id !== 'string' || !o.id || seen.has(o.id)) return []
        seen.add(o.id)
        return [fn(o as Loose & {id: string})]
    })
}

export function sanitizeAiModel(m: Loose & {id: string}): AiModelInfo {
    const cost = isLoose(m.cost) ? {input: num(m.cost.input), output: num(m.cost.output)} : undefined
    return {
        id: m.id,
        name: str(m.name),
        vendor: str(m.vendor),
        contextLength: num(m.contextLength),
        maxOutput: num(m.maxOutput),
        inputModalities: strs(m.inputModalities),
        outputModalities: strs(m.outputModalities),
        toolCall: bool(m.toolCall),
        reasoning: bool(m.reasoning),
        openWeights: bool(m.openWeights),
        cost: cost && (cost.input !== undefined || cost.output !== undefined) ? cost : undefined,
    }
}

/** Seeded only when settings have no `aiConfig` at all, so removing Local Ollama sticks. */
const AI_SEED: AppAiConfig = {
    enabled: true,
    providers: [{id: 'local-ollama', name: 'Local Ollama', baseURL: 'http://localhost:11434/v1', models: []}],
    modelProfiles: [{id: 'default', name: 'Default', providerId: 'local-ollama', modelId: '', systemPrompt: ''}],
    defaultModelProfile: 'default',
    features: {},
    chatStorage: 'app',
    chatMode: 'suggest',
    chatTitles: true,
    editorAssistant: {toolbar: true, slash: true, shortcut: true},
}

/** A stored chat mode (settings or a chat file) as a mode: `ask` is Read's old name; anything unknown is Suggest. */
export const toChatMode = (value: unknown): ChatMode => value === 'read' || value === 'ask' ? 'read' : value === 'write' ? 'write' : 'suggest'

export function defaultAppAiConfig(data?: unknown): AppAiConfig {
    if (data === undefined) return structuredClone(AI_SEED)
    const ai: Loose = isLoose(data) ? data : {}
    const providers = byId(ai.providers, (p): AiProviderProfile => ({
        id: p.id,
        name: str(p.name) ?? '',
        baseURL: str(p.baseURL) ?? '',
        models: byId(p.models, sanitizeAiModel),
    }))
    const modelProfiles = byId(ai.modelProfiles, (p): AiModelProfile => {
        const params = sanitizeModelParams(p.params)
        return {
            id: p.id,
            name: str(p.name) ?? '',
            providerId: str(p.providerId) ?? '',
            modelId: str(p.modelId) ?? '',
            systemPrompt: str(p.systemPrompt) ?? '',
            ...(p.tools === false && {tools: false as const}),
            ...(params && {params}),
        }
    })
    const preferred = str(ai.defaultModelProfile)
    const defaultModelProfile = modelProfiles.some(p => p.id === preferred) ? preferred! : modelProfiles[0]?.id ?? 'default'
    const features = Object.fromEntries(Object.entries(isLoose(ai.features) ? ai.features : {}).filter((e): e is [string, string] => typeof e[1] === 'string'))
    const chatStorage = ai.chatStorage === 'workspace' ? 'workspace' : 'app'
    const entries: Loose = isLoose(ai.editorAssistant) ? ai.editorAssistant : {}
    return {
        enabled: ai.enabled !== false,
        providers, modelProfiles, defaultModelProfile, features, chatStorage,
        chatMode: toChatMode(ai.chatMode),
        chatTitles: ai.chatTitles !== false,
        editorAssistant: {toolbar: entries.toolbar !== false, slash: entries.slash !== false, shortcut: entries.shortcut !== false},
    }
}

export function defaultAppWorkflowConfig(data?: DeepPartial<AppWorkflowConfig>): AppWorkflowConfig {
    return {
        maxLoopIterations: positiveInt(data?.maxLoopIterations, 100_000),
        maxStackDepth: positiveInt(data?.maxStackDepth, 64),
        wallClockTimeoutMs: data?.wallClockTimeoutMs === 0 ? 0 : positiveInt(data?.wallClockTimeoutMs, 30_000),
        confirmTrash: data?.confirmTrash ?? true,
        fileTrust: data?.fileTrust === 'path' ? 'path' : 'content',
    } satisfies AppWorkflowConfig
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

/** `root`: the workspace root, to turn old absolute paths into relative ones (the index's `relativePath`); others are dropped. */
export function defaultAppSessionContext(data?: LegacyContext, root = ''): AppSessionContext {
    const relative = (path: string) => root && path.length > root.length && path.startsWith(root) && /[\\/]/.test(path[root.length]!)
        ? path.slice(root.length + 1)
        : undefined
    const paths = (current: string[] | undefined, legacy: string[] | undefined) =>
        current ?? (legacy ?? []).map(relative).filter((p): p is string => !!p)
    return {
        openedFilePaths: paths(data?.openedFilePaths, data?.openedAbsoluteFilePaths),
        openedFolderPaths: paths(data?.openedFolderPaths, data?.openedAbsoluteFolderPaths),
        lastFocusedFilePath: data?.lastFocusedFilePath ?? (data?.lastFocusedAbsoluteFilePath && relative(data.lastFocusedAbsoluteFilePath)),
        openedChatIds: data?.openedChatIds || [],
        lastFocusedChatId: data?.lastFocusedChatId,
        shownPanelViews: panelViews(data?.shownPanelViews, [data?.leftPanelView, data?.rightPanelView]),
        leftPanelCollapsed: data?.leftPanelCollapsed === true,
        rightPanelCollapsed: data?.rightPanelCollapsed !== false,
    } satisfies AppSessionContext
}

export function defaultAppViewConfig(data?: DeepPartial<AppViewConfig>): AppViewConfig {
    return {
        fileTree: {
            showDefaultFileIcons: data?.fileTree?.showDefaultFileIcons ?? false,
            showDefaultFolderIcons: data?.fileTree?.showDefaultFolderIcons ?? true,
            showFoldArrows: data?.fileTree?.showFoldArrows ?? false,
            showFileExtInName: data?.fileTree?.showFileExtInName ?? false,
            showFileExtAsTag: data?.fileTree?.showFileExtAsTag ?? true,
            allowCustomFolderIcons: data?.fileTree?.allowCustomFolderIcons ?? true,
            allowCustomFileIcons: data?.fileTree?.allowCustomFileIcons ?? true,
        },
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
