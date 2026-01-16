import {DispatcherEvent} from "@type32/dispatcher"

export interface WindowMenuEvents {
    categories: {
        file: {
            new: {
                newFile: DispatcherEvent<{ windowSessionId: string }>,
                newFolder
            }
        }
    }
}