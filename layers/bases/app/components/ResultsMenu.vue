<script setup lang="ts">
import {writeTextFile} from "@tauri-apps/plugin-fs";
import {setLimit} from "@type32/obsidian-bases-parser";
import {basesContext} from "../plugin";
import {useCopyTable} from "../lib/useBaseCommands";
import {useBaseContext} from "../lib/useBaseContext";
import {tableCells, toCsv} from "../lib/basesTable";

/** Obsidian's results count and its menu: the view's limit, Show all, Copy to clipboard, Export CSV. */
const {t} = useI18n()
const ctx = useBaseContext()
const toast = useToast()
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
    const target = await basesContext().dialogs.save({defaultPath: `${ctx.view.value.name || t('plugins.bases.untitled')}.csv`, filters: [{name: 'CSV', extensions: ['csv']}]})
    if (!target) return
    try {
        await writeTextFile(target, text)
        toast.add({title: t('plugins.bases.exported', {name: target.slice(target.lastIndexOf('/') + 1)}), color: 'success', icon: 'lucide:circle-check'})
    } catch (error) {
        toast.add({title: t('plugins.bases.saveFailed'), description: String(error), color: 'error', icon: 'lucide:circle-alert'})
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
            :label="t('plugins.bases.results', {count: shown}, shown)"
        />
        <template #content>
            <div class="w-[300px] p-2 flex flex-col gap-1">
                <div class="flex items-center gap-2 px-1">
                    <span class="grow text-sm">{{ t('plugins.bases.limit') }}</span>
                    <UInput
                        type="number"
                        size="sm"
                        class="w-24"
                        :min="0"
                        :model-value="ctx.view.value.limit"
                        :placeholder="t('plugins.bases.limitPlaceholder')"
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
                    :label="t('plugins.bases.showAllCount', {count: ctx.result.value.total})"
                    @click="limit(null); open = false"
                />
                <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-copy" :label="t('plugins.bases.copyToClipboard')" @click="copy"/>
                <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-file-down" :label="t('plugins.bases.exportCsv')" @click="exportCsv"/>
            </div>
        </template>
    </UPopover>
</template>
