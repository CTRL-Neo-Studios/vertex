<script setup lang="ts">
import {CompileError, DOCUMENT_FORMAT, migrate, type Diagnostic, type DocumentV1} from "@type32/workflows/core"
import {useWorkflowEditor, WorkflowCanvas, WorkflowDiagnostics, WorkflowPalette} from "@type32/workflows/vue"
import type {UndoResult} from "#shared/workflows/effects"
import {vertexLanguage} from "#shared/workflows/vertex"
import {useActiveSessions} from "~/composables/active/useActiveSessions"
import useQuickToasts from "~/composables/utility/useQuickToasts"
import {useWorkflowRunner, type RunOutcome} from "~/composables/workflows/useWorkflowRunner"

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
    disabled?: boolean,
}>(), {filePath: '', disabled: false})
const emit = defineEmits<{ 'on-rename': [oldValue: string, newValue: string] }>()

const {t} = useI18n()
const $qt = useQuickToasts()
const session = useActiveSessions().getSession(props.sessionId)!
const runner = useWorkflowRunner(session)

const emptyDocument = (): DocumentV1 => ({
    format: DOCUMENT_FORMAT,
    language: {id: vertexLanguage.manifest.language.id, version: vertexLanguage.manifest.language.version},
    program: {graph: {nodes: [], edges: []}, variables: [], functions: []},
    view: {positions: {}, groups: []},
})

function parse(text: string): { doc?: DocumentV1, problems: Diagnostic[] } {
    if (!text.trim()) return {doc: emptyDocument(), problems: []}
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch (error) {
        return {problems: [{code: 'E_INVALID_DOCUMENT', severity: 'error', message: String(error)}]}
    }
    const loaded = migrate(raw, vertexLanguage)
    return 'doc' in loaded ? {doc: loaded.doc, problems: []} : {problems: loaded.diagnostics}
}

const initial = parse(content.value)
const loadProblems = ref(initial.problems)
const editor = useWorkflowEditor(vertexLanguage.manifest, initial.doc ?? emptyDocument())
const canvasKey = ref(0)

// Text ↔ document. `written` is the last text this viewer produced, so its own saves don't reload it.
let written = content.value
const serialize = () => `${JSON.stringify(editor.snapshot(), null, 2)}\n`
watch(() => editor.document.value, () => {
    if (loadProblems.value.length) return
    const text = serialize()
    if (text === content.value) return
    written = text
    content.value = text
}, {deep: true})
watch(content, text => {
    if (text === written) return
    written = text
    const next = parse(text)
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

async function act(kind: 'dry' | 'run') {
    busy.value = true
    undone.value = undefined
    try {
        const doc = editor.snapshot()
        const out = kind === 'dry' ? await runner.dryRun(doc) : await runner.run(doc, fileName.value || 'Workflow')
        if (!out) return $qt.info(t('app.editor.ui.workflow.declined'))
        outcome.value = out
        editor.trace.value = out.trace
    } catch (error) {
        $qt.error(t('app.editor.ui.workflow.failed'), error instanceof CompileError ? error.diagnostics[0]?.message : String(error))
    } finally {
        busy.value = false
    }
}

async function undo() {
    busy.value = true
    try {
        undone.value = await runner.undo()
        editor.trace.value = []
    } catch (error) {
        $qt.error(t('app.editor.ui.workflow.failed'), String(error))
    } finally {
        busy.value = false
    }
}

const status = computed(() => {
    const r = outcome.value?.result
    if (!r) return undefined
    const dry = outcome.value!.dry ? `${t('app.editor.ui.workflow.dryRun')} · ` : ''
    if (r.status === 'ok') return {color: 'success' as const, icon: 'i-lucide-circle-check', title: dry + t('app.editor.ui.workflow.ok', {steps: r.steps})}
    return {
        color: 'error' as const,
        icon: 'i-lucide-octagon-alert',
        title: dry + (r.status === 'aborted' ? t('app.editor.ui.workflow.aborted') : t('app.editor.ui.workflow.fault', {code: r.fault?.code ?? ''})),
        description: r.fault?.message ?? '',
    }
})
</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="none"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
        :showStatusBar="false"
        :bottomSpacing="false"
    >
        <div
            v-if="loadProblems.length"
            class="w-full p-6"
        >
            <UAlert
                color="error"
                variant="subtle"
                icon="i-lucide-file-x"
                :title="t('app.editor.ui.workflow.invalid')"
                :description="t('app.editor.ui.workflow.invalidDescription')"
            />
            <ul class="mt-3 space-y-1 font-mono text-xs text-muted">
                <li v-for="(d, i) in loadProblems" :key="i"><span class="text-error">{{ d.code }}</span> {{ d.message }}</li>
            </ul>
        </div>
        <div
            v-else
            class="workflow-viewer grid w-full grid-cols-[14rem_1fr_20rem] border-t border-default"
            :style="{height: 'calc(100vh - var(--ui-header-height) - 3rem)'}"
        >
            <aside class="overflow-y-auto border-e border-default">
                <WorkflowPalette :editor="editor"/>
            </aside>
            <main class="min-w-0">
                <WorkflowCanvas :key="canvasKey" :editor="editor"/>
            </main>
            <aside class="flex flex-col gap-5 overflow-y-auto border-s border-default p-4">
                <div class="flex flex-wrap gap-2">
                    <UTooltip :text="errors.length ? t('app.editor.ui.workflow.runDisabled') : undefined" :disabled="!errors.length">
                        <UButton
                            size="sm"
                            icon="i-lucide-play"
                            :label="t('app.editor.ui.workflow.run')"
                            :loading="busy"
                            :disabled="busy || errors.length > 0"
                            @click="act('run')"
                        />
                    </UTooltip>
                    <UButton
                        size="sm"
                        color="neutral"
                        variant="outline"
                        icon="i-lucide-flask-conical"
                        :label="t('app.editor.ui.workflow.dryRun')"
                        :disabled="busy || errors.length > 0"
                        @click="act('dry')"
                    />
                    <UButton
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-undo-2"
                        :label="t('app.editor.ui.workflow.undo')"
                        :disabled="busy || !runner.canUndo.value"
                        @click="undo"
                    />
                </div>

                <section>
                    <h3 class="mb-2 text-xs font-medium text-dimmed">{{ t('app.editor.ui.workflow.problems') }}</h3>
                    <WorkflowDiagnostics :editor="editor"/>
                </section>

                <section>
                    <h3 class="mb-2 text-xs font-medium text-dimmed">{{ t('app.editor.ui.workflow.lastRun') }}</h3>
                    <p v-if="!status" class="text-sm text-muted">{{ t('app.editor.ui.workflow.noRun') }}</p>
                    <div v-else class="space-y-2">
                        <UAlert :color="status.color" variant="subtle" :icon="status.icon" :title="status.title" :description="status.description"/>
                        <h4 class="text-xs text-dimmed">{{ outcome!.dry ? t('app.editor.ui.workflow.wouldChange') : t('app.editor.ui.workflow.changed') }}</h4>
                        <WorkflowOps :ops="outcome!.ops"/>
                    </div>
                    <UAlert
                        v-if="undone"
                        class="mt-2"
                        :color="undone.skipped.length ? 'warning' : 'success'"
                        variant="subtle"
                        icon="i-lucide-undo-2"
                        :title="t('app.editor.ui.workflow.undone', {count: undone.undone})"
                        :description="undone.skipped.length ? t('app.editor.ui.workflow.undoSkipped', {count: undone.skipped.length, reasons: [...new Set(undone.skipped.map(s => s.reason))].join('; ')}) : ''"
                    />
                </section>
            </aside>
        </div>
    </ViewerEditorLayoutWrapper>
</template>
