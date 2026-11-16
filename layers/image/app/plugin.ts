import {definePlugin} from '#shared/plugin/api'

const isImage = (ext: string) => ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)

export default definePlugin({
    setup(ctx) {
        ctx.views.fileViewer({id: 'image', loadsText: false, match: isImage, component: () => import('./components/Viewer.vue')})
        // `![[pic.png]]` in notes, through its asset URL; captioned with the file's name.
        ctx.editor.embed({id: 'image', match: isImage, component: () => import('./components/Embed.vue')})
    },
})
