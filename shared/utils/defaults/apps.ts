import type {AppRecents} from "#shared/types/app/recents";
import type {ActiveTab} from "#shared/types/active/tabs";
import useUuid from "~/composables/utility/useUuid";

export function defaultAppRecents(data?: Partial<AppRecents>): AppRecents {
    return {
        recentRecords: data?.recentRecords ?? [],
    } satisfies AppRecents;
}

export function defaultActiveTab(data?: Partial<ActiveTab>): ActiveTab {
    return {
        changesSaved: data?.changesSaved ?? false,
        fileUuid: data?.fileUuid ?? useUuid()
    } satisfies ActiveTab
}