import {defineComponent, h} from 'vue'
import {definePlugin} from '#shared/plugin/api'

const WordCounter = () => import('~/components/ViewerEditor/Component/WordCounter.vue')
/** The counter with lines only, for code and LaTeX. */
async function LineCounter() {
    const {default: counter} = await WordCounter()
    return defineComponent((props: { text: string, filePath: string }) => () => h(counter, {...props, words: false, paragraphs: false}), {props: ['text', 'filePath']})
}

export default definePlugin({
    setup(ctx) {
        // About the open note, which a Bases file doesn't have.
        ctx.views.panel({
            id: 'writersTools', label: 'app.editor.ui.functions.writersTools', icon: 'i-lucide-pencil', defaultArea: 'right',
            when: c => c.activeViewer !== 'bases', scroll: true,
            component: () => import('~/components/WritersInfoPanelComponent.vue'),
        })
        // The editor's status bar: words, lines and paragraphs of prose; lines of code.
        ctx.views.statusItem({id: 'writers-tools:wordCount', viewers: ['markdown', 'yaml'], component: WordCounter})
        ctx.views.statusItem({id: 'writers-tools:lineCount', viewers: ['code', 'latex'], component: LineCounter})
    },
})
