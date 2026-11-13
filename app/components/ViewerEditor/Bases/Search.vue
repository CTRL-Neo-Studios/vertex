<script setup lang="ts">
import {useBaseContext} from "~/composables/bases/useBaseContext";

/** Obsidian's toolbar Search: an icon button that opens a small input over the rows (never written to the file). */
const {t} = useI18n()
const {search} = useBaseContext()
const expanded = ref(false)

/** Esc or blur folds it back only while it's empty, so a search stays visible. */
function collapse() {
    if (!search.value) expanded.value = false
}
</script>

<template>
    <UInput
        v-if="expanded || search"
        v-model="search"
        autofocus
        size="sm"
        icon="i-lucide-search"
        class="w-40"
        :placeholder="t('app.editor.ui.bases.search')"
        @blur="collapse"
        @keydown.esc="collapse"
    />
    <UButton v-else size="sm" color="neutral" variant="ghost" icon="i-lucide-search" :label="t('app.editor.ui.bases.search')" @click="expanded = true"/>
</template>
