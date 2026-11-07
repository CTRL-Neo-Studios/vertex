/**
 * The UUID of a file ActiveTab is the corresponding index file's assigned UUID.
 *
 * So, `activeTab.uuid == indexedFile.uuid`, in simpler terms. A chat tab's id is the chat id.
 */
export interface ActiveTab {
    fileUuid: string,
    changesSaved: boolean,
    /** Missing = a file tab. */
    kind?: 'chat',
}