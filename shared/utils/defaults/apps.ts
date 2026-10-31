import type {AppSettings, AppViewConfig, SessionRecoveryMode} from "#shared/types/app/settings";
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
		deviceId: data?.deviceId || crypto.randomUUID(),
        updateChannel: data?.updateChannel || 'stable'
    } satisfies AppSettings
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
