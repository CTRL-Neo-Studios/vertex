import {defineAsyncComponent} from 'vue'
import {hashProgram} from '@type32/workflows/core'
import type {PluginContext} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import type {WorkflowsApi} from './api'
import {registerNodes} from './lib/language'
import {parseWorkflow, useWorkflowRunner, type WorkflowRunner} from './lib/useWorkflowRunner'

/** The manifest's settings (`config.schema`), checked and defaulted by the kernel; global only. */
export interface WorkflowsConfig {
    /** Step limit per run (`limits.steps`): every node activation counts, so loops can't run forever. */
    maxLoopIterations: number
    /** Call depth limit (`limits.depth`). */
    maxStackDepth: number
    /** Wall-clock limit per run; 0 = none. */
    wallClockTimeoutMs: number
    /** Ask before a run's first move to the vault trash. */
    confirmTrash: boolean
}

let ctx: PluginContext<WorkflowsConfig> | undefined
/** The plugin's context, for its components and runner (they work only while it runs). */
export const workflowsContext = () => ctx!

const isWorkflow = (ext: string) => ext === 'workflow'
const stem = (name: string) => name.replace(/\.[^.]*$/, '')
const extOf = (name: string) => (name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '')

export default definePlugin<WorkflowsConfig>({
    setup(context) {
        ctx = context
        const {t} = useNuxtApp().$i18n
        context.files.type({
            id: 'workflow',
            extensions: ['workflow'],
            icon: 'i-lucide-workflow',
            label: 'plugins.workflows.fileType',
            new: {label: 'plugins.workflows.new', command: 'plugins.workflows.newCommand', description: 'plugins.workflows.newDescription'},
        })
        // Workflows run on the workspace; in a singlespace a `.workflow` opens as JSON.
        context.views.fileViewer({id: 'workflow', loadsText: true, modes: ['workspace'], match: isWorkflow, component: () => import('./components/Viewer.vue')})
        // Trusting a folder in content mode pins its workflows' programs, as they are now.
        context.trust.format({
            extensions: ['workflow'],
            async hash(text) {
                const doc = parseWorkflow(text).doc
                return doc && await hashProgram(doc)
            },
        })

        /** The window's session's runner, once the session is handed to plugins. */
        let runner: WorkflowRunner | undefined
        const ready = () => {
            if (!runner) throw new Error('Workflows run in a workspace window')
            return runner
        }
        context.provide({
            run: (path, options) => ready().runPath(path, false, options),
            dryRun: (path, options) => ready().runPath(path, true, options),
            registerNodes,
            Ops: defineAsyncComponent(() => import('./components/Ops.vue')),
        } satisfies WorkflowsApi)

        // Run workflow from the file menu and the palette. Workflows run on a workspace folder.
        context.onSession(session => {
            if (!session.session.rootPath) return
            runner = useWorkflowRunner(session)
            onScopeDispose(() => { runner = undefined })
            const workflows = computed(() => session.index.files().filter(f => !f.isFolder && isWorkflow(extOf(f.fileName))))

            // `.workflow`: Run / Dry run. A note: run one of the vault's workflows on it.
            context.files.menuItem({
                id: 'workflows:run',
                items({files}) {
                    const node = files.length === 1 ? files[0]! : undefined
                    if (!node || node.isFolder) return []
                    const ext = extOf(node.fileName)
                    if (isWorkflow(ext)) return [
                        {label: t('plugins.workflows.workflow.run'), icon: 'i-lucide-play', onSelect: () => runner?.runFile(node.relativePath, false)},
                        {label: t('plugins.workflows.workflow.dryRun'), icon: 'i-lucide-flask-conical', onSelect: () => runner?.runFile(node.relativePath, true)},
                    ]
                    if (ext !== 'md') return []
                    return [{
                        label: t('plugins.workflows.workflow.runOnNote'),
                        icon: 'i-lucide-workflow',
                        disabled: !workflows.value.length,
                        children: workflows.value.map(w => ({
                            label: stem(w.fileName),
                            description: w.relativePath,
                            icon: 'i-lucide-workflow',
                            onSelect: () => runner?.runFile(w.relativePath, false, {note: node.relativePath}),
                        })),
                    }]
                },
            })

            // Each workflow, run on the open note when there is one (for Current note).
            context.commands.paletteGroup({
                id: 'workflows',
                label: () => t('plugins.workflows.palette.group'),
                order: 30,
                items() {
                    const active = session.index.byUuid(session.tabs.active() ?? '')
                    const note = active && extOf(active.fileName) === 'md' ? active.relativePath : undefined
                    return workflows.value.map(f => ({
                        id: `run:${f.uuid}`,
                        label: t('plugins.workflows.palette.run', {name: stem(f.fileName)}),
                        description: note ? t('plugins.workflows.palette.runOn', {note}) : f.relativePath,
                        icon: 'i-lucide-play',
                        onSelect: () => runner?.runFile(f.relativePath, false, {note}),
                    }))
                },
            })
        })
    },
})
