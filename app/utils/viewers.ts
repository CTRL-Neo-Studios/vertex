import type {InjectionKey, Ref} from "vue";
import type {SessionMode} from "#shared/constants/app";
import type {StatusItemProps, ViewerDef} from "#shared/plugin/api";
import {isPlainTextFile, isUnreadableAsText} from "#shared/utils/fs/filenames";
import {fileViewers} from "~/utils/contributions";

/**
 * Which viewer opens a file: of the registered ones (`fileViewers`) that work in the session's mode and match the
 * extension, the one with the highest `priority`; on a tie, the one registered first.
 */
export function viewerFor(ext: string, mode: SessionMode): ViewerDef | undefined {
    let best: ViewerDef | undefined
    for (const viewer of fileViewers.items.values()) {
        if (viewer.modes && !viewer.modes.includes(mode)) continue
        if (viewer.match(ext) && (!best || (viewer.priority ?? 0) > (best.priority ?? 0))) best = viewer
    }
    return best
}

/**
 * The viewer a file tab shows and what its status items are drawn with (`undefined` until the session is handed to
 * plugins). `SessionTab` provides it; the viewer's `LayoutWrapper` draws the status bar's items for it.
 */
export const SHOWN_VIEWER: InjectionKey<{
    viewer: Readonly<Ref<ViewerDef | undefined>>
    status: Readonly<Ref<StatusItemProps | undefined>>
}> = Symbol('shown-viewer')

// The kernel's own: notes, and the code editor for any other file readable as text (when nothing else matches).
fileViewers.register({id: 'markdown', loadsText: true, match: isPlainTextFile, component: () => import('~/components/ViewerEditor/RichText.vue')})
fileViewers.register({id: 'code', loadsText: true, priority: -100, match: ext => !isUnreadableAsText(ext), component: () => import('~/components/ViewerEditor/CodeText.vue')})
