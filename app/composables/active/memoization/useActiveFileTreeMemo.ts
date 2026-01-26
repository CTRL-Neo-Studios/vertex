import type {ActiveSession} from "#shared/types/active/sessions";
import useUuid from "~/composables/utility/useUuid";
import {useFileIO} from "~/composables/io/useFileIO";
import {getFileExtensionFromPath} from "#shared/utils/fs/filenames";

interface FileTreeMemo { ext: string, name: string, unextName: string }

export function useActiveFileTreeMemo(session?: ActiveSession) {
    if (!session) {
        console.error('Invalid session.')
    }

    const $fio = useFileIO()

    const fileNameCache = useState<Map<string, FileTreeMemo>>(`active.workspace.${session?.uuid ?? useUuid()}.processed-file-labels`, () => new Map())

    function put(fullLabel: string): FileTreeMemo {
        const name = fullLabel.slice(0, fullLabel.length - 4)
        const memo: FileTreeMemo = {
            name,
            unextName: $fio.processFileNameFromPath(name, true),
            ext: getFileExtensionFromPath(name)
        }
        unref(fileNameCache).set(fullLabel, memo)
        return memo
    }

    function get(fullLabel?: string): FileTreeMemo  {
        if(!fullLabel) return {ext: '?', name: '?', unextName: '?'}
        if (!unref(fileNameCache).has(fullLabel)) return put(fullLabel)
        else return unref(fileNameCache).get(fullLabel) as FileTreeMemo
    }

    return {
        get,
        put
    }
}