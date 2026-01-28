import useUuid from "~/composables/utility/useUuid";
import type {AppSettings, AppViewConfig} from "#shared/types/app/settings";
import type {AppSession, AppSessionContext} from "#shared/types/app/sessions";
import {defaultAppAdvancedThemeConfig, defaultAppThemeConfig} from "#shared/utils/defaults/themes";
import type {DeepPartial} from "#shared/types/types";

export function defaultAppSettings(data?: DeepPartial<AppSettings>): AppSettings {
    return {
        openLastOpenedWindows: data?.openLastOpenedWindows || false,
        themeConfig: defaultAppThemeConfig(data?.themeConfig),
        advancedThemeConfig: defaultAppAdvancedThemeConfig(data?.advancedThemeConfig),
        viewConfig: defaultAppViewConfig(data?.viewConfig)
    } satisfies AppSettings
}

export function defaultAppSession(data?: Partial<AppSession>): AppSession {
    return {
        uuid: data?.uuid || useUuid(),
        sessionType: data?.sessionType || 'workspace',
        rootFileOrFolderAbsolutePath: data?.rootFileOrFolderAbsolutePath || '',
        context: defaultAppSessionContext(data?.context),
        lastUpdated: data?.lastUpdated || new Date()
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
            showFileIcons: data?.fileTree?.showFileIcons ?? false,
            showFolderIcons: data?.fileTree?.showFolderIcons ?? true,
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