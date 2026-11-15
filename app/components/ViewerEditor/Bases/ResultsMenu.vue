<script setup lang="ts">
import {save} from "@tauri-apps/plugin-dialog";
import {writeTextFile} from "@tauri-apps/plugin-fs";
import {setLimit} from "@type32/obsidian-bases-parser";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {useCopyTable} from "~/composables/bases/useBaseCommands";
import {useBaseContext} from "~/composables/bases/useBaseContext";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {tableCells, toCsv} from "~/utils/basesTable";

/** Obsidian's results count and its menu: the view's limit, Show all, Copy to clipboard, Export CSV. */
const {t} = useI18n()
const ctx = useBaseContext()
const $qt = useQuickToasts()
const copyTable = useCopyTable()

const open = computed({
    get: () => ctx.open.value === 'results',
    set: value => ctx.open.value = value ? 'results' : null,
})

const shown = computed(() => ctx.result.value.rows.length)
const limited = computed(() => ctx.result.value.total > shown.value)

/** Empty or 0 removes the limit. */
function limit(value: number | null) {
    ctx.commit(setLimit(ctx.base.value, ctx.view.value.name, value || null))
}

const cells = () => tableCells(ctx.view.value.order, id => ctx.property(id).label, ctx.result.value.rows)

function copy() {
    open.value = false
    return copyTable(ctx)
}

async function exportCsv() {
    open.value = false
    const text = toCsv(cells())
    const target = await save({defaultPath: `${ctx.view.value.name || t('app.editor.ui.bases.untitled')}.csv`, filters: [{name: 'CSV', extensions: ['csv']}]})
    if (!target) return
    try {
        await writeTextFile(target, text)
        $qt.success(t('app.editor.ui.bases.exported', {name: fileNameFromPath(target)}))
    } catch (error) {
        $qt.error(t('app.editor.ui.saveFailed'), String(error))
    }
}
</script>

<template>
    <UPopover v-model:open="open">
        <UButton
            size="sm"
            :color="limited ? 'primary' : 'neutral'"
            variant="ghost"
            icon="i-lucide-text-align-start"
            :label="t('app.editor.ui.bases.results', {count: shown}, shown)"
        />
        <template #content>
            <div class="w-[300px] p-2 flex flex-col gap-1">
                <div class="flex items-center gap-2 px-1">
                    <span class="grow text-sm">{{ t('app.editor.ui.bases.limit') }}</span>
                    <UInput
                        type="number"
                        size="sm"
                        class="w-24"
                        :min="0"
                        :model-value="ctx.view.value.limit"
                        :placeholder="t('app.editor.ui.bases.limitPlaceholder')"
                        @update:model-value="value => limit(Number(value))"
                    />
                </div>
                <USeparator class="my-1"/>
                <UButton
                    v-if="limited"
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-rotate-ccw"
                    :label="t('app.editor.ui.bases.showAllCount', {count: ctx.result.value.total})"
                    @click="limit(null); open = false"
                />
                <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-copy" :label="t('app.editor.ui.bases.copyToClipboard')" @click="copy"/>
                <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-file-down" :label="t('app.editor.ui.bases.exportCsv')" @click="exportCsv"/>
            </div>
        </template>
    </UPopover>
</template>
