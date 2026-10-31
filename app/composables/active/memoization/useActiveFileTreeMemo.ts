import type {ActiveSession} from "#shared/types/active/sessions";
import {sessionScope, StateKey} from "#shared/constants/app";
import {useFileIO} from "~/composables/io/useFileIO";
import {getFileExtensionFromPath} from "#shared/utils/fs/filenames";

interface FileTreeMemo { ext: string, name: string, unextName: string }
interface FileTreeIdMemo {fid: string}

export function useActiveFileTreeMemo(session?: ActiveSession) {
    const scope = sessionScope(session, 'useActiveFileTreeMemo')
    const $fio = useFileIO()

    const fileNameCache = useState<Map<string, FileTreeMemo>>(StateKey.fileTreeLabels(scope), () => new Map())
    const fileNameIdCache = useState<Map<string, FileTreeIdMemo>>(StateKey.fileTreeIdMeta(scope), () => new Map())

    function putToLabel(fullLabel: string): FileTreeMemo {
        const name = fullLabel.slice(0, fullLabel.length - 4)
        const memo: FileTreeMemo = {
            name,
            unextName: $fio.processFileNameFromPath(name, true),
            ext: getFileExtensionFromPath(name)
        }
        unref(fileNameCache).set(fullLabel, memo)
        return memo
    }

    function getFromLabel(fullLabel?: string): FileTreeMemo  {
        if(!fullLabel) return {ext: '?', name: '?', unextName: '?'}
        if (!unref(fileNameCache).has(fullLabel)) return putToLabel(fullLabel)
        else return unref(fileNameCache).get(fullLabel) as FileTreeMemo
    }

    function putToIdMeta(fullLabel: string, fileId: string): FileTreeIdMemo {
        const memo: FileTreeIdMemo = {
            fid: fileId,
        }
        unref(fileNameIdCache).set(fullLabel, memo)
        return memo
    }

    function getFromIdMeta(fullLabel?: string): FileTreeIdMemo | undefined {
        if (!fullLabel) return;
        return unref(fileNameIdCache).get(fullLabel) as FileTreeIdMemo
    }

    return {
        getFromLabel,
        putToLabel,
        putToIdMeta,
        getFromIdMeta
    }
}