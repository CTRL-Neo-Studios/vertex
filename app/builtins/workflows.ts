import {hashProgram} from '@type32/workflows/core'
import {definePlugin} from '#shared/plugin/api'
import {fileNameFromPath, getFileExtensionFromPath, isWorkflowFile} from '#shared/utils/fs/filenames'
import {useActiveTabs} from '~/composables/active/useActiveTabs'
import {useActiveWorkspaceIndex} from '~/composables/active/useActiveWorkspaceIndex'
import {registerTrustedFormat} from '~/composables/app/useTrust'
import {parseWorkflow, useWorkflowRunner} from '~/composables/workflows/useWorkflowRunner'

export default definePlugin({
    setup(ctx) {
        ctx.files.type({
            id: 'workflow',
            extensions: ['workflow'],
            icon: 'i-lucide-workflow',
            label: 'app.editor.ui.fileTypes.workflow',
            new: {label: 'app.editor.ui.filetree.newWorkflow', command: 'app.commands.newWorkflow', description: 'app.editor.ui.palette.newWorkflowDescription'},
        })
        // Workflows run on the workspace; in a singlespace a `.workflow` opens as JSON.
        ctx.views.fileViewer({id: 'workflow', loadsText: true, modes: ['workspace'], match: isWorkflowFile, component: () => import('~/components/ViewerEditor/WorkflowViewer.vue')})
        ctx.settings.page({id: 'workflows', label: 'app.settings.nav.workflows', icon: 'i-lucide-workflow', component: () => import('~/components/Settings/Workflows/WorkflowsSettings.vue')})
        // Trusting a folder in content mode pins its workflows' programs, as they are now.
        onScopeDispose(registerTrustedFormat({
            match: isWorkflowFile,
            async hash(text) {
                const doc = parseWorkflow(text).doc
                return doc && await hashProgram(doc)
            },
        }))
        // Run workflow from Files' row menu and the palette. Workflows run on a workspace folder.
        ctx.onSession(({session}) => {
            if (!session.rootPath) return
            const {t} = useNuxtApp().$i18n
            const runner = useWorkflowRunner(session)
            const {fileIndex, getFileByUuid, getFilteredFiles} = useActiveWorkspaceIndex(session)
            const {activeTabUuid} = useActiveTabs(session)
            // Once per index change, not per note row each time a menu opens.
            const workflows = computed(() => getFilteredFiles(f => !f.isFolder && isWorkflowFile(getFileExtensionFromPath(f.fileName))))

            // `.workflow`: Run / Dry run. A note: run one of the vault's workflows on it.
            ctx.files.menuItem({
                id: 'workflows:run',
                items({files}) {
                    const node = files.length === 1 ? files[0]! : undefined
                    if (!node || node.isFolder) return []
                    const ext = getFileExtensionFromPath(node.fileName)
                    if (isWorkflowFile(ext)) return [
                        {label: t('app.editor.ui.workflow.run'), icon: 'i-lucide-play', onSelect: () => runner.runFile(node.relativePath, false)},
                        {label: t('app.editor.ui.workflow.dryRun'), icon: 'i-lucide-flask-conical', onSelect: () => runner.runFile(node.relativePath, true)},
                    ]
                    if (ext.toLowerCase() !== 'md') return []
                    return [{
                        label: t('app.editor.ui.workflow.runOnNote'),
                        icon: 'i-lucide-workflow',
                        disabled: !workflows.value.length,
                        children: workflows.value.map(w => ({
                            label: fileNameFromPath(w.fileName, true),
                            description: w.relativePath,
                            icon: 'i-lucide-workflow',
                            onSelect: () => runner.runFile(w.relativePath, false, {note: node.relativePath}),
                        })),
                    }]
                },
            })

            // Each workflow, run on the open note when there is one (for Current note).
            ctx.commands.paletteGroup({
                id: 'workflows',
                label: () => t('app.editor.ui.palette.workflows'),
                order: 30,
                items() {
                    const active = getFileByUuid(activeTabUuid.value ?? undefined)
                    const note = active && getFileExtensionFromPath(active.fileName) === 'md' ? active.relativePath : undefined
                    return Object.values(unref(fileIndex))
                        .filter(f => !f.isFolder && isWorkflowFile(getFileExtensionFromPath(f.fileName)))
                        .map(f => ({
                            id: `run:${f.uuid}`,
                            label: t('app.editor.ui.palette.runWorkflow', {name: fileNameFromPath(f.fileName, true)}),
                            description: note ? t('app.editor.ui.palette.runWorkflowOn', {note}) : f.relativePath,
                            icon: 'i-lucide-play',
                            onSelect: () => runner.runFile(f.relativePath, false, {note}),
                        }))
                },
            })
        })
    },
})
