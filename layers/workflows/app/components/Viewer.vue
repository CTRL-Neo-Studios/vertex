<script setup lang="ts">
import type {TypeTerm} from "@type32/workflows/core"
import {defaultMessages, useWorkflowEditor, WorkflowWidget, WorkflowWorkbench, type WorkflowMessages} from "@type32/workflows/vue"
import {readText, writeText} from "@tauri-apps/plugin-clipboard-manager"
import type {SessionContext} from "#shared/plugin/api"
import {ViewerLayout} from "~/plugin/ui"
import type {UndoResult} from "../../shared/effects"
import {useNotify} from "../lib/notify"
import {useWorkflowManifest} from "../lib/useWorkflowManifest"
import {failureOf, newWorkflow, parseWorkflow, useWorkflowRunner} from "../lib/useWorkflowRunner"
import type {RunOutcome} from "../api"

/**
 * The `.workflow` editor (workspace mode only). The file is untrusted JSON: it's loaded through `migrate`, and
 * a file that doesn't load stays read-only. Edits serialize back into the text model, which the tab autosaves.
 */
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({default: ''})
defineModel<boolean>('contentSaved', {default: false})
const props = withDefaults(defineProps<{
    renaming: boolean,
    filePath?: string,
    sessionId: string,
    session: SessionContext,
    disabled?: boolean,
}>(), {filePath: '', disabled: false})
const emit = defineEmits<{ rename: [oldValue: string, newValue: string] }>()

const {t} = useI18n()
const notify = useNotify()
const runner = useWorkflowRunner(props.session)

const initial = parseWorkflow(content.value)
const loadProblems = ref(initial.problems)

// The canvas's own strings, translated; a getter, so a locale switch reaches them.
const wf = (key: string, params: Record<string, unknown> = {}) => t(`plugins.workflows.canvas.${key}`, params)
const messages = (): WorkflowMessages => ({
    ...Object.fromEntries(Object.keys(defaultMessages).map(key => [key, wf(key)])) as unknown as WorkflowMessages,
    cantConnect: reason => wf('cantConnect', {reason}),
    getVariable: name => wf('getVariable', {name}),
    setVariable: name => wf('setVariable', {name}),
    defaultValue: value => wf('defaultValue', {value}),
    selected: count => wf('selected', {count}),
    referenceIn: (graph, node) => wf('referenceIn', {graph, node}),
    variableName: n => wf('variableName', {n}),
    blockName: n => wf('blockName', {n}),
    usedBy: count => wf('usedBy', {count}),
    returnVia: exit => wf('returnVia', {exit}),
    pausedBefore: node => wf('pausedBefore', {node}),
})
// Node labels follow the app's language as of opening the tab.
const editor = useWorkflowEditor(useWorkflowManifest().value, initial.doc ?? newWorkflow(), {
    messages,
    clipboard: {read: readText, write: writeText},
})

/** The picker an Entry, File, Note or Folder literal gets, by its resolved type. */
const PATH_WIDGETS: Record<string, {kind: 'file' | 'folder' | 'any', extensions?: string}> = {
    'vertex.Entry': {kind: 'any'},
    'vertex.File': {kind: 'file'},
    'vertex.Note': {kind: 'file', extensions: 'md'},
    'vertex.Folder': {kind: 'folder'},
}
const pathWidget = (type: TypeTerm | undefined) => (type?.kind === 'con' ? PATH_WIDGETS[type.id] : undefined)
const canvasKey = ref(0)

// Text ↔ document. `written` is the last text this viewer produced, so its own saves don't reload it. An edit made
// here carries the file's trust from the program it had (the text before) to the new one; an empty file had none.
let written = content.value
const serialize = () => `${JSON.stringify(editor.snapshot(), null, 2)}\n`
watch(() => editor.document.value, () => {
    if (loadProblems.value.length) return
    const text = serialize()
    if (text === content.value) return
    const before = content.value.trim() ? parseWorkflow(content.value).doc : undefined
    if (before || !content.value.trim()) runner.followEdit(props.filePath, before, editor.snapshot())
    written = text
    content.value = text
}, {deep: true})
watch(content, text => {
    if (text === written) return
    written = text
    const next = parseWorkflow(text)
    loadProblems.value = next.problems
    if (next.doc) {
        editor.document.value = next.doc
        canvasKey.value++
    }
})

const errors = computed(() => editor.analysis.value.diagnostics.filter(d => d.severity === 'error'))
const busy = ref(false)
const outcome = shallowRef<RunOutcome>()
const undone = shallowRef<UndoResult>()

// Runs go through the editor, so the canvas shows them live and can pause, step or cancel them. Trust is asked
// first, so the run bar doesn't show over the prompt.
async function act(kind: 'dry' | 'run') {
    if (busy.value || editor.running.value || errors.value.length) return
    undone.value = undefined
    try {
        const doc = editor.snapshot()
        const name = fileName.value || 'Workflow'
        if (kind === 'run' && !await runner.askTrust(doc, name, props.filePath)) return notify.info(t('plugins.workflows.workflow.declined'))
        const out = await editor.run(live => kind === 'dry' ? runner.dryRun(doc, name, {}, live) : runner.run(doc, name, props.filePath, {}, live))
        if (!out) return notify.info(t('plugins.workflows.workflow.declined'))
        outcome.value = out
    } catch (error) {
        notify.error(t('plugins.workflows.workflow.failed'), failureOf(error))
    }
}
defineShortcuts({meta_enter: () => act('run'), meta_shift_enter: () => act('dry')})

async function undo() {
    busy.value = true
    try {
        undone.value = await runner.undo()
        editor.trace.value = []
    } catch (error) {
        notify.error(t('plugins.workflows.workflow.failed'), String(error))
    } finally {
        busy.value = false
    }
}

const status = computed(() => {
    const r = outcome.value?.result
    if (!r) return undefined
    const dry = outcome.value!.dry ? `${t('plugins.workflows.workflow.dryRun')} · ` : ''
    if (r.status === 'ok') return {color: 'success' as const, icon: 'i-lucide-circle-check', title: dry + t('plugins.workflows.workflow.ok', {steps: r.steps})}
    return {
        color: 'error' as const,
        icon: 'i-lucide-octagon-alert',
        title: dry + (r.status === 'aborted' ? t('plugins.workflows.workflow.aborted') : t('plugins.workflows.workflow.fault', {code: r.fault?.code ?? ''})),
        description: r.fault?.message ?? '',
    }
})
</script>

<template>
    <ViewerLayout
        scrollMode="none"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
        :showStatusBar="false"
        :topSpacing="false"
        :bottomSpacing="false"
    >
        <div
            v-if="loadProblems.length"
            class="w-full p-6 pt-12"
        >
            <UAlert
                color="error"
                variant="subtle"
                icon="i-lucide-file-x"
                :title="t('plugins.workflows.workflow.invalid')"
                :description="t('plugins.workflows.workflow.invalidDescription')"
            />
            <ul class="mt-3 space-y-1 font-mono text-xs text-muted">
                <li v-for="(d, i) in loadProblems" :key="i"><span class="text-error">{{ d.code }}</span> {{ d.message }}</li>
            </ul>
        </div>
        <!-- Under the header, whose gradient fades the canvas out at the top, as a note fades under it. -->
        <div
            v-else
            class="workflow-viewer w-full h-full"
        >
            <WorkflowWorkbench :key="canvasKey" :editor="editor">
                <template #widget="w">
                    <WorkflowPathWidget
                        v-if="pathWidget(w.type)"
                        :kind="pathWidget(w.type)!.kind"
                        :extensions="pathWidget(w.type)!.extensions"
                        :session-id="props.sessionId"
                        :value="w.value"
                        :fallback="w.fallback"
                        :update="w.update"
                    />
                    <WorkflowDataWidget
                        v-else-if="w.schema?.type === 'array' || w.schema?.type === 'object'"
                        :port="w.port"
                        :schema="w.schema"
                        :value="w.value"
                        :fallback="w.fallback"
                        :update="w.update"
                    />
                    <WorkflowWidget v-else v-bind="w"/>
                </template>
                <template #toolbar>
                    <UTooltip :text="errors.length ? t('plugins.workflows.workflow.runDisabled') : undefined" :disabled="!errors.length">
                        <UButton
                            size="sm"
                            icon="i-lucide-play"
                            class="shadow-sm"
                            :label="t('plugins.workflows.workflow.run')"
                            :loading="editor.running.value"
                            :disabled="busy || editor.running.value || errors.length > 0"
                            @click="act('run')"
                        />
                    </UTooltip>
                    <UButton
                        size="sm"
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-flask-conical"
                        class="bg-default shadow-sm"
                        :label="t('plugins.workflows.workflow.dryRun')"
                        :disabled="busy || editor.running.value || errors.length > 0"
                        @click="act('dry')"
                    />
                    <UButton
                        size="sm"
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-undo-2"
                        class="bg-default shadow-sm"
                        :aria-label="t('plugins.workflows.workflow.undo')"
                        :disabled="busy || editor.running.value || !runner.canUndo.value"
                        @click="undo"
                    />
                </template>
                <template #inspector>
                    <section class="border-t border-default p-3">
                        <h3 class="mb-2 text-xs font-medium text-dimmed">{{ t('plugins.workflows.workflow.lastRun') }}</h3>
                        <p v-if="!status" class="text-sm text-muted">{{ t('plugins.workflows.workflow.noRun') }}</p>
                        <div v-else class="space-y-2">
                            <UAlert :color="status.color" variant="subtle" :icon="status.icon" :title="status.title" :description="status.description"/>
                            <h4 class="text-xs text-dimmed">{{ outcome!.dry ? t('plugins.workflows.workflow.wouldChange') : t('plugins.workflows.workflow.changed') }}</h4>
                            <WorkflowOps :ops="outcome!.ops"/>
                        </div>
                        <UAlert
                            v-if="undone"
                            class="mt-2"
                            :color="undone.skipped.length ? 'warning' : 'success'"
                            variant="subtle"
                            icon="i-lucide-undo-2"
                            :title="t('plugins.workflows.workflow.undone', {count: undone.undone})"
                            :description="undone.skipped.length ? t('plugins.workflows.workflow.undoSkipped', {count: undone.skipped.length, reasons: [...new Set(undone.skipped.map(s => s.reason))].join('; ')}) : ''"
                        />
                    </section>
                </template>
            </WorkflowWorkbench>
        </div>
    </ViewerLayout>
</template>

<style scoped>
/*
 * The canvas runs under the tab's header (h-10); what the workbench pins to the top (its side panels and the canvas's
 * banner) starts below it, where it can be clicked. `@type32/workflows` has no top inset (`insets` is left and right).
 */
.workflow-viewer :deep(.inset-y-3) {
    top: calc(2.5rem + 0.75rem);
}

.workflow-viewer :deep(.top-3.left-1\/2) {
    top: calc(2.5rem + 0.75rem);
}
</style>
