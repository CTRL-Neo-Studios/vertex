import {DispatcherEvent} from "@type32/dispatcher"

export interface WindowMenuEvents {
    categories: {
        file: {
            new: {
                newFile: DispatcherEvent,
                newFolder: DispatcherEvent
            },
            open: {
                openFile: DispatcherEvent,
                openFolder: DispatcherEvent
            },
            save: DispatcherEvent,
            saveAs: DispatcherEvent
        },
        view: {
            closeTabOrWindow: DispatcherEvent,
            clearTabs: DispatcherEvent
        },
        about: {
            toRepo: DispatcherEvent,
            toSoftware: DispatcherEvent,
            toDocs: DispatcherEvent,
            toRepoIssues: DispatcherEvent,
        }
    }
}