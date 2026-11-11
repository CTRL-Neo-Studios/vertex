<script setup lang="ts">
/**
 * A name already taken where an item is going (a move or a drop), as a file manager asks: Replace the existing item,
 * Keep both (the incoming one is numbered), or Skip it. With `remaining` clashes after this one, the answer can apply
 * to all of them. Cancel stops the whole operation.
 */
export type ConflictAction = 'replace' | 'keepBoth' | 'skip'
type Side = { isFolder: boolean, size: number, modified: Date | number }

const props = defineProps<{ name: string, folder: string, existing: Side, incoming: Side, remaining: number }>()
const emit = defineEmits<{ close: [{ action: ConflictAction | 'cancel', all: boolean }] }>()
const {t, locale} = useI18n()
const all = ref(false)
const answer = (action: ConflictAction | 'cancel') => emit('close', {action, all: all.value})

const UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const
function describe(side: Side) {
    const date = new Date(side.modified).toLocaleString(locale.value)
    if (side.isFolder) return t('app.editor.ui.conflict.folderInfo', {date})
    const step = Math.min(Math.floor(Math.log(Math.max(side.size, 1)) / Math.log(1024)), UNITS.length - 1)
    const size = (side.size / 1024 ** step).toLocaleString(locale.value, {style: 'unit', unit: UNITS[step], unitDisplay: 'narrow', maximumFractionDigits: 1})
    return t('app.editor.ui.conflict.fileInfo', {size, date})
}
</script>

<template>
    <UModal
        :title="t('app.editor.ui.conflict.title', {name: props.name, folder: props.folder})"
        :description="t('app.editor.ui.conflict.description')"
        :close="{ onClick: () => answer('cancel') }"
        size="sm"
    >
        <template #body>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt class="text-muted">{{ t('app.editor.ui.conflict.existing') }}</dt>
                <dd>{{ describe(props.existing) }}</dd>
                <dt class="text-muted">{{ t('app.editor.ui.conflict.incoming') }}</dt>
                <dd>{{ describe(props.incoming) }}</dd>
            </dl>
        </template>
        <template #footer>
            <div class="w-full flex flex-col gap-3">
                <UCheckbox v-if="props.remaining > 0" v-model="all" :label="t('app.editor.ui.conflict.applyToAll', {count: props.remaining})"/>
                <div class="inline-flex items-center justify-end gap-2">
                    <UButton size="sm" color="neutral" variant="ghost" :label="t('app.generic.cancel')" class="me-auto" @click="answer('cancel')"/>
                    <UButton size="sm" color="neutral" variant="soft" :label="t('app.editor.ui.conflict.skip')" @click="answer('skip')"/>
                    <UButton size="sm" color="error" variant="soft" :label="t('app.editor.ui.conflict.replace')" @click="answer('replace')"/>
                    <UButton size="sm" color="primary" :label="t('app.editor.ui.conflict.keepBoth')" autofocus @click="answer('keepBoth')"/>
                </div>
            </div>
        </template>
    </UModal>
</template>
