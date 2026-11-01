<script setup lang="ts">
import type {Op} from "#shared/workflows/effects"
import {baseNameOf, parentOf} from "#shared/workflows/vault"

/** A run's changes (or a dry run's planned ones) as a short diff: moves by name, writes by changed lines. */
const props = defineProps<{ ops: Op[] }>()
const {t} = useI18n()

const ICONS = {rename: 'i-lucide-pencil-line', move: 'i-lucide-folder-input', trash: 'i-lucide-trash-2', property: 'i-lucide-list-plus', links: 'i-lucide-link'} as const

/** Lines only in `before` (−) and only in `after` (+); enough to show a property or a link change. */
function changedLines(before: string, after: string, max = 4) {
    const a = before.split('\n'), b = after.split('\n')
    return [
        ...a.filter(l => !b.includes(l)).slice(0, max).map(text => ({sign: '−', text})),
        ...b.filter(l => !a.includes(l)).slice(0, max).map(text => ({sign: '+', text})),
    ]
}

const rows = computed(() => props.ops.map(op => {
    if (op.kind === 'write') return {icon: ICONS[op.why], label: t(`app.editor.ui.workflow.ops.${op.why}`), path: op.path, detail: '', lines: changedLines(op.before, op.after)}
    const detail = op.why === 'rename' ? `→ ${baseNameOf(op.to)}` : op.why === 'move' ? `→ ${parentOf(op.to) || '/'}` : ''
    return {icon: ICONS[op.why], label: t(`app.editor.ui.workflow.ops.${op.why}`), path: op.from, detail, lines: []}
}))
</script>

<template>
    <p v-if="!rows.length" class="text-sm text-muted">{{ t('app.editor.ui.workflow.noChanges') }}</p>
    <ul v-else class="divide-y divide-default rounded-md border border-default text-xs">
        <li v-for="(row, i) in rows" :key="i" class="flex flex-col gap-1 p-2">
            <div class="flex items-center gap-1.5 min-w-0">
                <UIcon :name="row.icon" class="size-3.5 shrink-0 text-muted"/>
                <span class="text-toned shrink-0">{{ row.label }}</span>
                <code class="truncate text-highlighted">{{ row.path }}</code>
                <span v-if="row.detail" class="truncate text-primary">{{ row.detail }}</span>
            </div>
            <pre v-if="row.lines.length" class="ps-5 font-mono whitespace-pre-wrap break-all"><span
                v-for="(line, j) in row.lines" :key="j" :class="line.sign === '+' ? 'text-success' : 'text-error'"
            >{{ line.sign }} {{ line.text }}
</span></pre>
        </li>
    </ul>
</template>
