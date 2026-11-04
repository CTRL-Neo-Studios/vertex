<script lang="ts">
import type {CapabilityDef} from "@type32/workflows/core"
import type {DropdownMenuItem} from "@nuxt/ui"
import {fileNameFromPath} from "#shared/utils/fs/filenames"
import type {RunOutcome} from "~/composables/workflows/useWorkflowRunner"

/** What the user trusted: the workflow's file, or a folder (with its subfolders when `nested`). */
export type TrustAnswer = { kind: 'file' } | { kind: 'folder', path: string, nested: boolean }
</script>

<script setup lang="ts">
/**
 * A real run of a workflow outside the trusted folders and files: what it may do and, without prompts in it,
 * what a dry run says it would change (§11). Trusts its file, its folder, or the whole workspace.
 */
const props = defineProps<{
    name: string,
    capabilities: CapabilityDef[],
    /** Absent for a program that asks questions: it isn't dry-run before the prompt. */
    plan?: RunOutcome,
    /** Absolute paths: the workflow's file and its workspace's root. */
    file: string,
    root: string,
}>()
const emit = defineEmits<{ close: [answer: TrustAnswer | false] }>()
const {t} = useI18n()
const mutates = computed(() => props.capabilities.some(c => c.mutates))

const folders = computed<DropdownMenuItem[]>(() => {
    const folder = props.file.slice(0, props.file.lastIndexOf('/'))
    const name = fileNameFromPath(folder)
    const trust = (path: string, nested: boolean) => emit('close', {kind: 'folder', path, nested})
    return [
        ...(folder === props.root ? [] : [
            {label: t('app.editor.ui.workflowTrust.trustFolder', {name}), icon: 'i-lucide-folder-check', onSelect: () => trust(folder, false)},
            {label: t('app.editor.ui.workflowTrust.trustFolderNested', {name}), icon: 'i-lucide-folder-tree', onSelect: () => trust(folder, true)},
        ]),
        {label: t('app.editor.ui.workflowTrust.trustWorkspace'), icon: 'i-lucide-folder-lock', onSelect: () => trust(props.root, true)},
    ]
})
</script>

<template>
    <UModal
        :title="t('app.editor.ui.workflowTrust.title', {name: props.name})"
        :description="t('app.editor.ui.workflowTrust.description')"
        :close="{ onClick: () => emit('close', false) }"
    >
        <template #body>
            <div class="space-y-4">
                <section class="space-y-2">
                    <h3 class="text-xs font-medium text-dimmed">{{ t('app.editor.ui.workflowTrust.capabilities') }}</h3>
                    <div class="flex flex-wrap gap-1.5">
                        <UBadge
                            v-for="c in props.capabilities"
                            :key="c.id"
                            :color="c.mutates ? 'warning' : 'neutral'"
                            variant="subtle"
                            :icon="c.mutates ? 'i-lucide-pencil' : 'i-lucide-eye'"
                            :label="c.label"
                        />
                        <span v-if="!props.capabilities.length" class="text-sm text-muted">{{ t('app.editor.ui.workflowTrust.nothing') }}</span>
                    </div>
                </section>
                <section class="space-y-2">
                    <h3 class="text-xs font-medium text-dimmed">{{ t('app.editor.ui.workflowTrust.plan') }}</h3>
                    <p v-if="!props.plan" class="text-sm text-muted">{{ t('app.editor.ui.workflowTrust.noPlan') }}</p>
                    <template v-else>
                        <UAlert
                            v-if="props.plan.result.fault"
                            color="warning"
                            variant="subtle"
                            icon="i-lucide-triangle-alert"
                            :title="t('app.editor.ui.workflowTrust.dryRunFault', {message: props.plan.result.fault.message})"
                        />
                        <div class="max-h-72 overflow-y-auto">
                            <WorkflowOps :ops="props.plan.ops"/>
                        </div>
                    </template>
                </section>
            </div>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="ghost" :label="t('app.editor.ui.workflowTrust.cancel')" @click="emit('close', false)"/>
                <UFieldGroup size="sm">
                    <UButton :color="mutates ? 'warning' : 'primary'" icon="i-lucide-shield-check" :label="t('app.editor.ui.workflowTrust.trust')" autofocus @click="emit('close', {kind: 'file'})"/>
                    <UDropdownMenu :items="folders" :content="{align: 'end'}">
                        <UButton :color="mutates ? 'warning' : 'primary'" icon="i-lucide-chevron-down" :aria-label="t('app.editor.ui.workflowTrust.more')"/>
                    </UDropdownMenu>
                </UFieldGroup>
            </div>
        </template>
    </UModal>
</template>
