import {defineComponent, h} from 'vue'
import type {StatusItemProps} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'

const Counter = () => import('./components/Counter.vue')
/** The counter with lines only, for code and LaTeX. */
async function LineCounter() {
    const {default: counter} = await Counter()
    return defineComponent((props: Pick<StatusItemProps, 'text'>) => () => h(counter, {text: props.text, words: false, paragraphs: false}), {props: ['text']})
}

export default definePlugin({
    setup(ctx) {
        // About the open note, which a Bases file doesn't have.
        ctx.views.panel({
            id: 'writersTools', label: 'plugins.writers-tools.title', icon: 'i-lucide-pencil', defaultArea: 'right',
            when: c => c.activeViewer !== 'bases', scroll: true,
            component: () => import('./components/Panel.vue'),
        })
        // The editor's status bar: words, lines and paragraphs of prose; lines of code.
        ctx.views.statusItem({id: 'writers-tools:wordCount', viewers: ['markdown', 'yaml'], component: Counter})
        ctx.views.statusItem({id: 'writers-tools:lineCount', viewers: ['code', 'latex'], component: LineCounter})
    },
})
