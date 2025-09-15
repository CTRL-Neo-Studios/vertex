import type {ActiveTab} from "#shared/types/active/tabs";
import {defaultActiveTab} from "#shared/utils/defaults/apps";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {PossiblyRef} from "#shared/types/types";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";

export function useActiveTabs(session?: ActiveSession) {
    const tabs = useState<ActiveTab[]>(`active.tabs.${session?.uuid}`, () => [])
    const activeTabUuid = useState<string | null>(`active.tabs.uuid.${session?.uuid}`, () => null);

    /**
     * Opens a new tab for a given file UUID.
     * If the tab is already open, it just makes it active.
     */
    function openTab(fileUuidRef: PossiblyRef<string>) {
        const fileUuid = unref(fileUuidRef)
        const existingTab = unref(tabs).find(t => t.fileUuid === fileUuid);
        if (!existingTab) {
            tabs.value.push(defaultActiveTab({ fileUuid: fileUuid, changesSaved: true }));
        }
        activeTabUuid.value = fileUuid;

        return defaultActiveTab(getActiveTab(fileUuid))
    }

    /**
     * Closes a tab. If it was the active tab, it activates the next available tab.
     */
    function closeTab(uuidRef: PossiblyRef<string>) {
        const uuid = unref(uuidRef)
        const tabIndex = unref(tabs).findIndex(t => t.fileUuid === uuid);
        if (tabIndex === -1) return;

        // Was this the active tab?
        const wasActive = unref(activeTabUuid) === uuid;

        // Remove the tab from the array
        tabs.value.splice(tabIndex, 1);

        if (wasActive && unref(tabs).length > 0) {
            const nextTab = unref(tabs)[tabIndex] || unref(tabs)[tabIndex - 1];
            activeTabUuid.value = nextTab?.fileUuid || null;
        } else if (tabs.value.length === 0) {
            activeTabUuid.value = null;
        }
    }

    /**
     * Gets the tab in list of active tabs.
     * @param uuid uuid of the Tab.
     */
    function getActiveTab(uuidRef: PossiblyRef<string | undefined | null>): ActiveTab | undefined {
        const uuid = unref(uuidRef)
        return unref(tabs).find(i => i.fileUuid == uuid)
    }

    /**
     * Sets the active tab.
     */
    function setActiveTab(uuidRef: PossiblyRef<string>) {
        const uuid = unref(uuidRef)
        activeTabUuid.value = uuid;
    }

    /**
     * Clears all tabs.
     */
    function clearTabs() {
        tabs.value = []
        activeTabUuid.value = null
    }

    /**
     * Checks if the tab of the UUID is opened.
     */
    function isTabOpened(uuidRef: PossiblyRef<string>) {
        const uuid = unref(uuidRef)
        const tabIndex = unref(tabs).findIndex(t => t.fileUuid === uuid);
        return tabIndex !== -1
    }

    function setTabSavedState(uuidRef: PossiblyRef<string>, state: PossiblyRef<boolean>) {
        const uuid = unref(uuidRef);
        const newState = unref(state);

        const tab = unref(tabs).find(t => t.fileUuid === uuid);
        if (tab) {
            tab.changesSaved = newState;
        }
    }

    return {
        tabs,
        activeTabUuid,
        openTab,
        closeTab,
        setActiveTab,
        isTabOpened,
        getActiveTab,
        clearTabs,
        setTabSavedState
    };
}