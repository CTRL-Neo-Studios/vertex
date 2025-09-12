/**
 * The UUID of an ActiveTab is the corresponding index file's assigned UUID.
 *
 * So, `activeTab.uuid == indexedFile.uuid`, in simpler terms.
 */
export interface ActiveTab {
    fileUuid: string,
    changesSaved: boolean,
}