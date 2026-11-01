import type {AppSettings, AppViewConfig, AppWorkflowConfig, SessionRecoveryMode} from "#shared/types/app/settings";
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
		deviceId: data?.deviceId || crypto.randomUUID(),
        updateChannel: data?.updateChannel || 'stable'
    } satisfies AppSettings
}

const positiveInt = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback

export function defaultAppWorkflowConfig(data?: DeepPartial<AppWorkflowConfig>): AppWorkflowConfig {
    const trusted = data?.trustedPrograms
    return {
        maxLoopIterations: positiveInt(data?.maxLoopIterations, 100_000),
        maxStackDepth: positiveInt(data?.maxStackDepth, 64),
        wallClockTimeoutMs: data?.wallClockTimeoutMs === 0 ? 0 : positiveInt(data?.wallClockTimeoutMs, 30_000),
        confirmTrash: data?.confirmTrash ?? true,
        trustedPrograms: Object.fromEntries(Object.entries(trusted && typeof trusted === 'object' ? trusted : {})
            .filter(([hash, r]) => /^[0-9a-f]{64}$/.test(hash) && typeof r?.name === 'string' && typeof r?.trustedAt === 'string')
            .map(([hash, r]) => [hash, {name: r!.name!, trustedAt: r!.trustedAt!}])),
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
        }
    } satisfies AppViewConfig
}
