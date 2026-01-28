<script setup lang="ts">
import type {YamlFormData} from "#shared/types/types";
import YamlFormField from "~/components/ViewerEditor/Component/YamlFormField.vue";
import { useYamlFieldTypes, type YamlFieldType } from '~/composables/editor/useYamlFieldTypes'

/**
 * YAML Form Data Editor
 * 
 * Schema-driven form editor for YAML/frontmatter data.
 * Supports custom field types through the fieldTypes prop.
 * 
 * Features:
 * - Primitive types (string, number, boolean, null)
 * - Complex types (date, datetime, string-array)
 * - Objects (nested structures)
 * - Arrays (primitives and objects)
 * - Recursive structures
 * - Custom field types with custom components
 * 
 * Can be used standalone or embedded in the rich text editor for frontmatter editing.
 */

const data = defineModel<YamlFormData>({ required: true })
const fileName = defineModel<string>('fileName')

const props = withDefaults(defineProps<{
    filePath?: string,
    readonly?: boolean,
    /** Custom field type definitions (merged with defaults) */
    fieldTypes?: YamlFieldType[],
}>(), {
    readonly: false,
})

// Initialize field types composable with custom types
const { getDefaultValue, getTypeMenuItems } = useYamlFieldTypes(props.fieldTypes)

// Track if data has unsaved changes
const isDirty = ref(false)

// Watch for changes
watch(data, () => {
    isDirty.value = true
}, { deep: true })

// Add new field to root using schema-based default value
function addField(fieldType: string = 'string') {
    if (!data.value) data.value = {}
    
    const newKey = `field_${Object.keys(data.value).length + 1}`
    data.value[newKey] = getDefaultValue(fieldType)
}

// Remove field from root
function removeField(key: string) {
    if (data.value) {
        delete data.value[key]
    }
}

// Schema-based dropdown options for adding fields
const addFieldOptions = computed(() => {
    return getTypeMenuItems((type) => addField(type))
})
</script>

<template>
    <div class="space-y-4">
        <div class="space-y-3">
            <YamlFormField
                v-for="(value, key) in data"
                :key="String(key)"
                v-model="data[key]"
                :field-key="String(key)"
                :readonly="readonly"
                :field-types="fieldTypes"
                @remove="removeField(String(key))"
                @update:field-key="(newKey: string) => {
                    if (newKey !== key) {
                        data[newKey] = data[key]
                        delete data[key]
                    }
                }"
            />
        </div>
        
        <UDropdownMenu
            v-if="!readonly"
            :items="[addFieldOptions]"
            size="sm"
        >
            <UButton
                icon="i-lucide-plus"
                label="Add Field"
                variant="ghost"
                size="sm"
            />
        </UDropdownMenu>
    </div>
</template>
