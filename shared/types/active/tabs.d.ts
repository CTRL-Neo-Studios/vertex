/**
 * The UUID of a file ActiveTab is the corresponding index file's assigned UUID.
 *
 * So, `activeTab.uuid == indexedFile.uuid`, in simpler terms. A chat tab's id is the chat id; a diff tab's id holds
 * its diff (`diffTabId` in app/utils/gitDiff.ts); a view tab's id is the panel view's id.
 */
export interface ActiveTab {
    fileUuid: string,
    changesSaved: boolean,
    /** Missing = a file tab. */
    kind?: 'chat' | 'diff' | 'view',
}