/**
 * The UUID of a file ActiveTab is the corresponding index file's assigned UUID.
 *
 * So, `activeTab.uuid == indexedFile.uuid`, in simpler terms. Another tab is of a registered kind (`tabKinds`), its id
 * that kind's (a chat id, a diff spec, a panel view's id), unique among all tabs.
 */
export interface ActiveTab {
    fileUuid: string,
    changesSaved: boolean,
    /** A registered tab kind (`TabKindDef.kind`); missing = a file tab. */
    kind?: string,
}