import type {AppRecents} from "#shared/types/app/recents";
import useUuid from "~/composables/utility/useUuid";
import type {AppConfig} from "#shared/types/app/config";
import type {AppSession, AppSessionContext} from "#shared/types/app/sessions";

export function defaultAppRecents(data?: Partial<AppRecents>): AppRecents {
    return {
        recentRecords: data?.recentRecords ?? [],
    } satisfies AppRecents;
}

export function defaultAppConfig(data?: Partial<AppConfig>): AppConfig {
    return {
        openLastOpenedWindows: data?.openLastOpenedWindows ?? false
    } satisfies AppConfig
}

export function defaultAppSession(data?: Partial<AppSession>): AppSession {
    return {
        uuid: data?.uuid ?? useUuid(),
        sessionType: data?.sessionType ?? 'workspace',
        rootFileOrFolderAbsolutePath: data?.rootFileOrFolderAbsolutePath ?? '',
        context: defaultAppSessionContext(data?.context)
    }
}

export function defaultAppSessionContext(data?: Partial<AppSessionContext>): AppSessionContext {
    return {
        openedAbsoluteFilePaths: data?.openedAbsoluteFilePaths ?? []
    }
}