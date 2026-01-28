<script setup lang="ts">
/**
 * YAML Form Field - Recursive Component
 * 
 * Schema-driven field renderer with support for custom components.
 * Uses centralized field type registry for extensibility.
 * 
 * To add custom field types:
 * 1. Define your field type in the fieldTypes prop
 * 2. Provide a custom component via slot: #field-{component}
 * 
 * Example:
 * <YamlFormField :fieldTypes="[{ type: 'image', label: 'Image', icon: 'i-lucide-image', defaultValue: '', component: 'image' }]">
 *   <template #field-image="{ modelValue, readonly }">
 *     <MyImagePicker v-model="modelValue" :disabled="readonly" />
 *   </template>
 * </YamlFormField>
 */

import type {DropdownMenuItem} from "@nuxt/ui";
import Collapsible from "~/components/Utility/Collapsible.vue";
import YamlFieldInput from "~/components/ViewerEditor/Component/YamlFieldInput.vue";
import { useYamlFieldTypes, type YamlFieldType } from '~/composables/editor/useYamlFieldTypes'

type YamlValue = string | number | boolean | null | Date | YamlValue[] | { [key: string]: YamlValue }

const modelValue = defineModel<YamlValue>({ required: true })

const props = withDefaults(defineProps<{
    fieldKey: string,
    readonly?: boolean,
    depth?: number,
    /** Custom field type definitions (merged with defaults) */
    fieldTypes?: YamlFieldType[],
}>(), {
    readonly: false,
    depth: 0,
})

const emit = defineEmits<{
    remove: []
    'update:fieldKey': [newKey: string]
}>()

// Initialize field types composable with custom types
const { 
    fieldTypes, 
    getFieldType, 
    detectFieldType, 
    getDefaultValue, 
    getIcon,
    getTypeMenuItems 
} = useYamlFieldTypes(props.fieldTypes)

// Utility functions for type detection (kept for backward compatibility)
function isDateObject(val: any): val is Date {
    return val instanceof Date && !isNaN(val.getTime())
}

function isDateString(val: any): boolean {
    if (typeof val !== 'string') return false
    // Check for ISO 8601 date formats
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/
    if (!isoDateRegex.test(val)) return false
    const date = new Date(val)
    return !isNaN(date.getTime())
}

function isDateTimeString(val: any): boolean {
    if (typeof val !== 'string') return false
    // Check if it includes time component
    return /T\d{2}:\d{2}:\d{2}/.test(val) && isDateString(val)
}

function isStringArray(val: any): boolean {
    if (!Array.isArray(val)) return false
    if (val.length === 0) return false
    return val.every(item => typeof item === 'string')
}

function isPrimitiveArray(val: any): boolean {
    if (!Array.isArray(val)) return false
    if (val.length === 0) return false
    return val.every(item => 
        typeof item === 'string' || 
        typeof item === 'number' || 
        typeof item === 'boolean' || 
        item === null
    )
}

// Determine the type of the current value using schema-based detection
const valueType = computed(() => {
    const detectedType = detectFieldType(modelValue.value)
    return detectedType.type
})

// For editing field key
const isEditingKey = ref(false)
const editingKeyValue = ref(props.fieldKey)

// Watch for prop changes to keep editingKeyValue in sync
watch(() => props.fieldKey, (newKey) => {
    editingKeyValue.value = newKey
})

function startEditingKey() {
    if (props.readonly) return
    editingKeyValue.value = props.fieldKey  // Sync current value
    isEditingKey.value = true
}

function saveKey() {
    const trimmedValue = editingKeyValue.value?.trim()
    if (trimmedValue && trimmedValue !== props.fieldKey) {
        emit('update:fieldKey', trimmedValue)
    }
    isEditingKey.value = false
}

// Check if a type conversion is valid
function isValidConversion(fromType: string, toType: string): boolean {
    // Same type is always valid
    if (fromType === toType) return true
    
    // Null can convert to anything
    if (fromType === 'null') return true
    
    // Define conversion rules
    const conversionRules: Record<string, string[]> = {
        // Primitives can convert to other primitives and arrays
        'string': ['number', 'boolean', 'date', 'datetime', 'string-array', 'null'],
        'number': ['string', 'boolean', 'null'],
        'boolean': ['string', 'number', 'null'],
        
        // Dates can convert to strings and each other
        'date': ['string', 'datetime', 'null'],
        'datetime': ['string', 'date', 'null'],
        
        // String arrays can convert to regular arrays and back to string
        'string-array': ['array', 'string', 'null'],
        
        // Arrays can only convert to string-array or null (converting to primitives is unsafe)
        'array': ['string-array', 'null'],
        
        // Objects can only convert to null (converting to primitives is useless)
        'object': ['null'],
    }
    
    const allowedConversions = conversionRules[fromType] || []
    return allowedConversions.includes(toType)
}

// Type conversion using schema-based defaults
function convertType(newType: string) {
    const currentType = valueType.value
    
    // Check if conversion is valid
    if (!isValidConversion(currentType, newType)) {
        console.warn(`Invalid conversion from ${currentType} to ${newType}`)
        return
    }
    
    // Special handling for preserving data during certain conversions
    const isCurrentlyArray = Array.isArray(modelValue.value)
    const isConvertingToNonArray = !['array', 'string-array'].includes(newType)
    
    // Special case: string-array conversion (preserve/convert array items)
    if (newType === 'string-array') {
        if (Array.isArray(modelValue.value)) {
            modelValue.value = modelValue.value.map(item => String(item))
        } else {
            modelValue.value = [String(modelValue.value || '')]
        }
        return
    }
    
    // Special case: date ↔ datetime conversion (preserve the date value)
    if ((currentType === 'date' && newType === 'datetime') || (currentType === 'datetime' && newType === 'date')) {
        const currentValue = modelValue.value
        
        if (newType === 'datetime') {
            // Converting date to datetime: add time component
            if (typeof currentValue === 'string') {
                // If it's a date-only string (YYYY-MM-DD), add time
                if (/^\d{4}-\d{2}-\d{2}$/.test(currentValue)) {
                    modelValue.value = `${currentValue}T00:00:00`
                } else {
                    // Already has time, keep as is
                    modelValue.value = currentValue
                }
            } else {
                // Convert Date object to ISO string with time
                const date = isDateObject(currentValue) ? currentValue as Date : new Date()
                modelValue.value = date.toISOString()
            }
        } else {
            // Converting datetime to date: remove time component
            if (typeof currentValue === 'string') {
                modelValue.value = currentValue.split('T')[0]!
            } else {
                const date = isDateObject(currentValue) ? currentValue as Date : new Date()
                modelValue.value = date.toISOString().split('T')[0]!
            }
        }
        return
    }
    
    // Special case: converting from array to non-array (try to preserve first item)
    if (isCurrentlyArray && isConvertingToNonArray) {
        const arr = modelValue.value as YamlValue[]
        const firstItem = arr.length > 0 && arr[0] !== undefined ? arr[0] : null
        
        // Try to convert first item to target type
        if (firstItem !== null) {
            switch (newType) {
                case 'string':
                    modelValue.value = isDateObject(firstItem) 
                        ? (firstItem as Date).toISOString() 
                        : String(firstItem)
                    return
                case 'number':
                    modelValue.value = Number(firstItem) || 0
                    return
                case 'boolean':
                    modelValue.value = Boolean(firstItem)
                    return
                case 'date':
                    const dateVal = typeof firstItem === 'string' ? new Date(firstItem) : new Date()
                    modelValue.value = dateVal.toISOString().split('T')[0]!
                    return
                case 'datetime':
                    const dateTimeVal = typeof firstItem === 'string' ? new Date(firstItem) : new Date()
                    modelValue.value = dateTimeVal.toISOString()
                    return
            }
        }
    }
    
    // Default: use schema-defined default value
    modelValue.value = getDefaultValue(newType)
}

// Array operations
function addArrayItem(itemType?: string) {
    if (!Array.isArray(modelValue.value)) return
    
    // If itemType is provided, create item of that type using schema
    if (itemType) {
        modelValue.value.push(getDefaultValue(itemType))
        return
    }
    
    // If array is empty, default to empty object (most common use case)
    if (modelValue.value.length === 0) {
        modelValue.value.push({})
        return
    }
    
    // Determine type of new item based on existing items using schema detection
    const firstItem = modelValue.value[0]
    const detectedType = detectFieldType(firstItem)
    modelValue.value.push(getDefaultValue(detectedType.type))
}

function removeArrayItem(index: number) {
    if (!Array.isArray(modelValue.value)) return
    modelValue.value.splice(index, 1)
}

// Add array item from template (using object with most fields as template)
function addArrayItemFromTemplate() {
    if (!Array.isArray(modelValue.value)) return
    
    // Find the object with the most fields
    let templateObject: Record<string, YamlValue> | null = null
    let maxFields = 0
    
    for (const item of modelValue.value) {
        if (typeof item === 'object' && !Array.isArray(item) && item !== null) {
            const fieldCount = Object.keys(item).length
            if (fieldCount > maxFields) {
                maxFields = fieldCount
                templateObject = item as Record<string, YamlValue>
            }
        }
    }
    
    // If we found a template, create a new object with same structure but default values
    if (templateObject) {
        const newObject: Record<string, YamlValue> = {}
        
        for (const key in templateObject) {
            const value = templateObject[key]
            
            // Use schema-based detection and default value
            const detectedType = detectFieldType(value)
            newObject[key] = getDefaultValue(detectedType.type)
        }
        
        modelValue.value.push(newObject)
    } else {
        // Fallback to empty object if no template found
        modelValue.value.push({})
    }
}

// Check if array has objects that can be used as templates
const hasObjectTemplate = computed(() => {
    if (!Array.isArray(modelValue.value) || modelValue.value.length === 0) return false
    
    return modelValue.value.some(item => 
        typeof item === 'object' && 
        !Array.isArray(item) && 
        item !== null && 
        Object.keys(item).length > 0
    )
})

// Object operations
function addObjectField(fieldType: string = 'string') {
    if (typeof modelValue.value !== 'object' || Array.isArray(modelValue.value) || !modelValue.value || isDateObject(modelValue.value)) return
    
    const obj = modelValue.value as Record<string, YamlValue>
    const newKey = `field_${Object.keys(obj).length + 1}`
    
    // Use schema-based default value
    obj[newKey] = getDefaultValue(fieldType)
}

function removeObjectField(key: string) {
    if (typeof modelValue.value !== 'object' || Array.isArray(modelValue.value) || !modelValue.value || isDateObject(modelValue.value)) return
    const obj = modelValue.value as Record<string, YamlValue>
    delete obj[key]
}

// Open state for objects and arrays (true = expanded, false = collapsed)
const isOpen = ref(true)

// Check if this field is an array item (has bracket notation like [0], [1], etc.)
const isArrayItem = computed(() => {
    return /^\[\d+\]$/.test(props.fieldKey)
})

// Get count for badge display
const itemCount = computed(() => {
    if (valueType.value === 'array' && Array.isArray(modelValue.value)) {
        return modelValue.value.length
    } else if (valueType.value === 'object' && typeof modelValue.value === 'object' && !Array.isArray(modelValue.value) && modelValue.value !== null) {
        return Object.keys(modelValue.value).length
    }
    return 0
})

// Indentation based on depth
const indentClass = computed(() => {
    return props.depth > 0 ? 'pl-2' : ''
})

// Type options for dropdown - filtered by valid conversions
// Schema-based dropdown options for type conversion
const typeOptions = computed(() => {
    const currentType = valueType.value
    
    // Filter field types for valid conversions and map to dropdown items
    return fieldTypes.value
        .filter(ft => isValidConversion(currentType, ft.type))
        .map(ft => ({
            label: ft.label,
            icon: ft.icon,
            onSelect: () => convertType(ft.type)
        })) as DropdownMenuItem[]
})

// Get icon for current type using schema
const selectedType = computed(() => {
    return {
        icon: getIcon(valueType.value)
    }
})

// Schema-based dropdown options for adding object fields
const addFieldOptions = computed(() => {
    return getTypeMenuItems((type) => addObjectField(type))
})

// Schema-based dropdown options for adding array items
const addArrayItemOptions = computed(() => {
    return getTypeMenuItems((type) => addArrayItem(type))
})
</script>

<template>
    <div :class="indentClass" class="space-y-1">
        <!-- For Objects and Arrays: Use Collapsible -->
        <template v-if="valueType === 'object' || valueType === 'array'">
            <!-- Edit mode for field key -->
            <UInput
                v-if="isEditingKey"
                v-model="editingKeyValue"
                size="xs"
                autofocus
                class="mb-1"
                @blur="saveKey"
                @keydown.enter="saveKey"
                @keydown.esc="isEditingKey = false"
            />
            
            <!-- Collapsible for non-edit mode -->
            <Collapsible v-else v-model:open="isOpen" :default-open="true" :label="fieldKey">
                <template #badge>
                    <UBadge size="xs" variant="soft" color="neutral">{{ itemCount }}</UBadge>
                </template>
                
                <template #actions>
                    <div class="flex items-center gap-1">
                        <!-- Edit key button (hidden for array items) -->
                        <UButton
                            v-if="!readonly && !isEditingKey && !isArrayItem"
                            icon="i-lucide-pencil"
                            variant="ghost"
                            size="xs"
                            color="neutral"
                            class="text-muted"
                            @click.stop="startEditingKey"
                        />

                        <!-- Type selector -->
                        <UDropdownMenu
                            :items="[typeOptions]"
                            :disabled="readonly"
                            size="xs"
                        >
                            <UButton
                                :icon="selectedType?.icon || 'i-heroicons-circle-question-mark'"
                                variant="soft"
                                size="xs"
                                :disabled="readonly"
                            />
                        </UDropdownMenu>

                        <!-- Remove button -->
                        <UButton
                            v-if="!readonly"
                            icon="i-lucide-trash"
                            variant="ghost"
                            size="xs"
                            color="error"
                            @click.stop="emit('remove')"
                        />
                    </div>
                </template>

                <!-- Content inside collapsible - only arrays and objects -->
            <!-- Array (Complex items - objects/arrays) -->
            <div v-if="valueType === 'array'" class="space-y-2">
                <div
                    v-if="Array.isArray(modelValue) && modelValue.length === 0"
                    class="text-center py-4 text-sm text-muted border border-dashed border-default rounded-lg"
                >
                    <UIcon name="i-lucide-brackets" class="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Empty array</p>
                    <p v-if="!readonly" class="text-xs mt-1">Click "Add Item" below</p>
                </div>

                <template v-else-if="Array.isArray(modelValue)">
                    <div
                        v-for="(item, index) in modelValue"
                        :key="index"
                        class="flex items-start gap-2"
                    >
                        <div v-if="item !== undefined" class="flex-1">
                            <YamlFormField
                                :model-value="item"
                                :field-key="`[${index}]`"
                                :readonly="readonly"
                                :depth="depth + 1"
                                :field-types="fieldTypes"
                                @update:model-value="(val: YamlValue) => { 
                                    if (Array.isArray(modelValue)) modelValue[index] = val 
                                }"
                                @remove="removeArrayItem(index)"
                            />
                        </div>
                    </div>
                </template>

                <div class="flex items-center gap-2">
                    <UDropdownMenu
                        v-if="!readonly"
                        :items="[addArrayItemOptions]"
                        size="xs"
                    >
                        <UButton
                            icon="i-lucide-plus"
                            label="Add Item"
                            variant="link"
                            size="xs"
                            color="neutral"
                        />
                    </UDropdownMenu>

                    <!-- Add Item From Template button (only shown when array has objects) -->
                    <UButton
                        v-if="!readonly && hasObjectTemplate"
                        icon="i-lucide-copy-plus"
                        label="From Template"
                        variant="link"
                        size="xs"
                        color="neutral"
                        @click="addArrayItemFromTemplate"
                    />
                </div>
            </div>

            <!-- Object -->
            <div v-else-if="valueType === 'object'" class="space-y-2">
                <div
                    v-if="typeof modelValue === 'object' && !Array.isArray(modelValue) && modelValue !== null && !isDateObject(modelValue) && Object.keys(modelValue as Record<string, YamlValue>).length === 0"
                    class="text-center py-4 text-sm text-muted border border-dashed border-default rounded-lg"
                >
                    <UIcon name="i-lucide-box-transparent" class="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Empty object</p>
                    <p v-if="!readonly" class="text-xs mt-1">Click "Add Field" below</p>
                </div>

                <template v-else-if="typeof modelValue === 'object' && !Array.isArray(modelValue) && modelValue !== null && !isDateObject(modelValue)">
                    <template v-for="(value, key) in (modelValue as Record<string, YamlValue>)" :key="String(key)">
                        <YamlFormField
                            v-if="value !== undefined"
                            :model-value="value"
                            :field-key="String(key)"
                            :readonly="readonly"
                            :depth="depth + 1"
                            :field-types="fieldTypes"
                            @update:model-value="(val: YamlValue) => { 
                                if (typeof modelValue === 'object' && !Array.isArray(modelValue) && modelValue !== null && !isDateObject(modelValue)) {
                                    (modelValue as Record<string, YamlValue>)[key] = val
                                }
                            }"
                            @remove="removeObjectField(String(key))"
                            @update:field-key="(newKey: string) => {
                                if (newKey !== key && typeof modelValue === 'object' && !Array.isArray(modelValue) && modelValue !== null && !isDateObject(modelValue) && value !== undefined) {
                                    const obj = modelValue as Record<string, YamlValue>
                                    obj[newKey] = value
                                    delete obj[key]
                                }
                            }"
                        />
                    </template>
                </template>

                <UDropdownMenu
                    v-if="!readonly"
                    :items="[addFieldOptions]"
                    size="xs"
                >
                    <UButton
                        icon="i-lucide-plus"
                        label="Add Field"
                        variant="link"
                        size="xs"
                        color="neutral"
                    />
                </UDropdownMenu>
            </div>
            </Collapsible>
        </template>

        <!-- For Simple Types: Regular Layout -->
        <template v-else>
            <div class="flex items-center gap-1">
                <!-- Field Key (editable) -->
                <div class="flex-1 min-w-0">
                    <UInput
                        v-if="isEditingKey"
                        v-model="editingKeyValue"
                        size="xs"
                        autofocus
                        @blur="saveKey"
                        @keydown.enter="saveKey"
                        @keydown.esc="isEditingKey = false"
                    />
                    <UButton
                        v-else
                        class="text-xs font-medium text-left justify-start px-0 py-0 truncate"
                        :label="fieldKey"
                        block
                        variant="link"
                        color="neutral"
                        :disabled="readonly || isArrayItem"
                        @click="startEditingKey"
                    />
                </div>

                <!-- Type selector -->
                <UDropdownMenu
                    :items="[typeOptions]"
                    :disabled="readonly"
                    size="xs"
                >
                    <UButton
                        :icon="selectedType?.icon || 'i-lucide-circle-question-mark'"
                        variant="soft"
                        size="xs"
                        :disabled="readonly"
                    />
                </UDropdownMenu>

                <!-- Remove button -->
                <UButton
                    v-if="!readonly"
                    icon="i-lucide-trash"
                    variant="ghost"
                    size="xs"
                    color="error"
                    @click="emit('remove')"
                />
            </div>

            <!-- Value Input for simple types -->
            <YamlFieldInput
                v-model="modelValue"
                :value-type="valueType"
                :readonly="readonly"
                :field-type="getFieldType(valueType)"
            >
                <!-- Forward all custom field component slots -->
                <template v-for="(_, name) in $slots" #[name]="slotProps">
                    <slot :name="name" v-bind="slotProps" />
                </template>
            </YamlFieldInput>
        </template>
    </div>
</template>
