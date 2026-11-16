import {convertFileSrc} from '@tauri-apps/api/core'
import {definePlugin} from '#shared/plugin/api'
import {fileNameFromPath, isImage} from '#shared/utils/fs/filenames'

export default definePlugin({
    setup(ctx) {
        ctx.views.fileViewer({id: 'image', loadsText: false, match: isImage, component: () => import('~/components/ViewerEditor/ImageViewer.vue')})
        // `![[pic.png]]` in notes, through its asset URL; captioned with the file's name.
        ctx.editor.embed({
            id: 'image', match: isImage,
            props: f => ({srcPath: convertFileSrc(f.fullPath), display: fileNameFromPath(f.fullPath, true)}),
            component: () => import('~/components/EditorProse/Embed/ImageDisplay.vue'),
        })
    },
})
