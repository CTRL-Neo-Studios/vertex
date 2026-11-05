import type {AppSettings, AppViewConfig, AppWorkflowConfig, SessionRecoveryMode} from "#shared/types/app/settings";
import type {AiModelInfo, AiModelProfile, AiProviderProfile, AppAiConfig} from "#shared/types/app/ai";
import type {AppSession, AppSessionContext} from "#shared/types/app/sessions";
import {defaultAppAdvancedThemeConfig, defaultAppThemeConfig} from "#shared/utils/defaults/themes";
import type {DeepPartial} from "#shared/types/types";

const RECOVERY_MODES: readonly SessionRecoveryMode[] = ['none', 'workspaces', 'singlespaces', 'both']

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
    providers: [{id: 'local-ollama', name: 'Local Ollama', baseURL: 'http://localhost:11434/v1', models: []}],
    modelProfiles: [{id: 'default', name: 'Default', providerId: 'local-ollama', modelId: '', systemPrompt: ''}],
    defaultModelProfile: 'default',
    features: {},
}

export function defaultAppAiConfig(data?: unknown): AppAiConfig {
    if (data === undefined) return structuredClone(AI_SEED)
    const ai: Loose = isLoose(data) ? data : {}
    const providers = byId(ai.providers, (p): AiProviderProfile => ({
        id: p.id,
        name: str(p.name) ?? '',
        baseURL: str(p.baseURL) ?? '',
        models: byId(p.models, sanitizeAiModel),
    }))
    const modelProfiles = byId(ai.modelProfiles, (p): AiModelProfile => ({
        id: p.id,
        name: str(p.name) ?? '',
        providerId: str(p.providerId) ?? '',
        modelId: str(p.modelId) ?? '',
        systemPrompt: str(p.systemPrompt) ?? '',
    }))
    const preferred = str(ai.defaultModelProfile)
    const defaultModelProfile = modelProfiles.some(p => p.id === preferred) ? preferred! : modelProfiles[0]?.id ?? 'default'
    const features = Object.fromEntries(Object.entries(isLoose(ai.features) ? ai.features : {}).filter((e): e is [string, string] => typeof e[1] === 'string'))
    return {providers, modelProfiles, defaultModelProfile, features}
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

export function defaultAppSession(data?: Partial<AppSession>): AppSession {
    return {
        uuid: data?.uuid || crypto.randomUUID(),
        sessionType: data?.sessionType || 'workspace',
        rootFileOrFolderAbsolutePath: data?.rootFileOrFolderAbsolutePath || '',
        context: defaultAppSessionContext(data?.context),
        lastUpdated: data?.lastUpdated || new Date(),
		trustedDeviceIds: data?.trustedDeviceIds || [] as string[]
    } satisfies AppSession
}

export function defaultAppSessionContext(data?: Partial<AppSessionContext>): AppSessionContext {
    return {
        openedAbsoluteFilePaths: data?.openedAbsoluteFilePaths || [],
        openedAbsoluteFolderPaths: data?.openedAbsoluteFolderPaths || [],
        lastFocusedAbsoluteFilePath: data?.lastFocusedAbsoluteFilePath
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
        }
    } satisfies AppViewConfig
}
