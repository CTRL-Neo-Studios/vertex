<script setup lang="ts">
import type {YamlFormData} from "#shared/types/types";
import YamlFormField from "~/components/ViewerEditor/Component/YamlFormField.vue";
import LayoutWrapper from "~/components/ViewerEditor/LayoutWrapper.vue";

/**
 * YAML Form Data Editor
 * 
 * A recursive form editor for YAML/frontmatter data.
 * Supports:
 * - Primitive types (string, number, boolean, null)
 * - Objects (nested structures)
 * - Arrays (primitives and objects)
 * - Recursive structures
 * 
 * Can be used standalone or embedded in the rich text editor for frontmatter editing.
 */

const data = defineModel<YamlFormData>({ required: true })
const fileName = defineModel<string>('fileName')

const props = withDefaults(defineProps<{
    filePath?: string,
    embedded?: boolean, // When true, used as frontmatter editor (no layout wrapper)
    readonly?: boolean,
}>(), {
    embedded: false,
    readonly: false,
})

// Track if data has unsaved changes
const isDirty = ref(false)

// Watch for changes
watch(data, () => {
    isDirty.value = true
}, { deep: true })

// Add new field to root
function addField() {
    if (!data.value) data.value = {}
    
    const newKey = `field_${Object.keys(data.value).length + 1}`
    data.value[newKey] = ''
}

// Remove field from root
function removeField(key: string) {
    if (data.value) {
        delete data.value[key]
    }
}
</script>

<template>
    <!-- Embedded mode (no layout wrapper, for frontmatter editing) -->
    <div v-if="embedded" class="space-y-4">
        <div class="space-y-3">
            <YamlFormField
                v-for="(value, key) in data"
                :key="String(key)"
                v-model="data[key]"
                :field-key="String(key)"
                :readonly="readonly"
                @remove="removeField(String(key))"
                @update:field-key="(newKey: string) => {
                    if (newKey !== key) {
                        data[newKey] = data[key]
                        delete data[key]
                    }
                }"
            />
        </div>
        
        <UButton
            v-if="!readonly"
            icon="i-heroicons-plus"
            label="Add Field"
            variant="soft"
            size="sm"
            @click="addField"
        />
    </div>

    <!-- Standalone mode (with layout wrapper) -->
    <LayoutWrapper
        v-else
        v-model:fileName="fileName"
        :filePath="filePath"
        scrollMode="vertical"
        contentAlignment="start"
        contentMaxWidth="max-w-4xl"
        :cursorText="false"
    >
        <template #header-right>
            <div class="flex items-center gap-2">
                <UTooltip v-if="isDirty" text="Unsaved changes">
                    <UIcon name="i-heroicons-exclamation-circle" class="text-warning"/>
                </UTooltip>
            </div>
        </template>
        
        <template #default="{ contentWidthClass }">
            <div :class="contentWidthClass" class="space-y-6">
                <!-- Header -->
                <div class="space-y-2">
                    <h2 class="text-lg font-semibold">YAML Data</h2>
                    <p class="text-sm text-muted">
                        Edit your YAML frontmatter or configuration data.
                    </p>
                </div>

                <!-- Fields -->
                <UCard>
                    <div class="space-y-4">
                        <div v-if="!data || Object.keys(data).length === 0" class="text-center py-8">
                            <UIcon name="i-heroicons-document-text" class="w-12 h-12 mx-auto text-muted mb-3"/>
                            <p class="text-sm text-muted mb-4">No fields yet</p>
                            <UButton
                                icon="i-heroicons-plus"
                                label="Add First Field"
                                @click="addField"
                            />
                        </div>

                        <div v-else class="space-y-3">
                            <YamlFormField
                                v-for="(value, key) in data"
                                :key="String(key)"
                                v-model="data[key]"
                                :field-key="String(key)"
                                :readonly="readonly"
                                @remove="removeField(String(key))"
                                @update:field-key="(newKey: string) => {
                                    if (newKey !== key) {
                                        data[newKey] = data[key]
                                        delete data[key]
                                    }
                                }"
                            />
                        </div>
                        
                        <UButton
                            v-if="data && Object.keys(data).length > 0 && !readonly"
                            icon="i-heroicons-plus"
                            label="Add Field"
                            variant="soft"
                            size="sm"
                            class="w-full"
                            @click="addField"
                        />
                    </div>
                </UCard>
            </div>
        </template>
        
        <template #status-bar>
            <div class="flex items-center gap-3 text-xs text-dimmed">
                <span>{{ Object.keys(data || {}).length }} fields</span>
                <USeparator orientation="vertical" class="h-3"/>
                <span>YAML</span>
            </div>
        </template>
    </LayoutWrapper>
</template>
