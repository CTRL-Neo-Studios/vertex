<script setup lang="ts">
import type {Json, SchemaTemplate} from "@type32/workflows/core"

/**
 * The literal editor for List and Dictionary inputs: a list of text as chips, anything else in a popover with
 * the frontmatter form's field editor. Emptying it removes the literal, like clearing a text input. The form
 * can add items of any type; the compiler flags what doesn't fit the input's type.
 */
const props = defineProps<{
    port: string,
    schema: SchemaTemplate,
    value: Json | undefined,
    fallback: Json | undefined,
    update: (value: Json | undefined) => void,
}>()
const {t} = useI18n()
const list = computed(() => props.schema.type === 'array')
const tags = computed(() => list.value && (props.schema.items as SchemaTemplate | undefined)?.type === 'string')
const shown = computed<Json>(() => props.value ?? props.fallback ?? (list.value ? [] : {}))
const count = computed(() => (Array.isArray(shown.value) ? shown.value.length : Object.keys(shown.value ?? {}).length))

// The form makes Date objects for date fields; a literal is JSON.
const toJson = (v: unknown): Json => v instanceof Date ? v.toISOString()
    : Array.isArray(v) ? v.map(toJson)
        : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toJson(x)]))
            : v as Json

function set(v: unknown) {
    const json = toJson(v)
    const empty = json !== null && typeof json === 'object' && !Object.keys(json).length
    props.update(empty ? undefined : json)
}
</script>

<template>
    <UInputTags
        v-if="tags"
        size="xs"
        class="min-w-32 max-w-64"
        :model-value="Array.isArray(props.value) ? props.value as string[] : []"
        :placeholder="Array.isArray(props.fallback) && props.fallback.length ? props.fallback.join(', ') : t('app.editor.ui.workflowData.addItem')"
        @update:model-value="set"
    />
    <UPopover v-else>
        <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :icon="list ? 'i-lucide-list' : 'i-lucide-braces'"
            :label="t(list ? 'app.editor.ui.workflowData.list' : 'app.editor.ui.workflowData.dictionary', {count})"
            :class="props.value === undefined && 'text-dimmed'"
        />
        <template #content>
            <div class="w-80 max-h-96 overflow-y-auto p-2">
                <YamlFormField :field-key="props.port" :model-value="shown as never" size="xs" @update:model-value="set" @remove="props.update(undefined)"/>
            </div>
        </template>
    </UPopover>
</template>
