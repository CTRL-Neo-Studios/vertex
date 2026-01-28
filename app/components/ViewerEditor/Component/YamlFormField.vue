<script setup lang="ts">
/**
 * YAML Form Field - Recursive Component
 * 
 * Renders appropriate input based on value type:
 * - string → UInput
 * - number → UInputNumber
 * - boolean → USwitch
 * - date → UInputDate
 * - datetime → UInputDate + UInputTime
 * - null → UInput (nullable)
 * - string-array → UInputTags
 * - array → Expandable list of items
 * - object → Nested fields
 */

import { CalendarDate, CalendarDateTime, Time, parseDate, parseDateTime, parseTime } from '@internationalized/date'
import type {DropdownMenuItem} from "@nuxt/ui";

type YamlValue = string | number | boolean | null | Date | YamlValue[] | { [key: string]: YamlValue }

const modelValue = defineModel<YamlValue>({ required: true })

const props = withDefaults(defineProps<{
    fieldKey: string,
    readonly?: boolean,
    depth?: number,
}>(), {
    readonly: false,
    depth: 0,
})

const emit = defineEmits<{
    remove: []
    'update:fieldKey': [newKey: string]
}>()

// Utility functions for type detection
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

// Determine the type of the current value
const valueType = computed(() => {
    const val = modelValue.value
    
    if (val === null) return 'null'
    if (isDateObject(val)) return 'datetime'
    if (isDateTimeString(val)) return 'datetime'
    if (isDateString(val)) return 'date'
    if (isStringArray(val)) return 'string-array'
    if (Array.isArray(val)) return 'array'
    if (typeof val === 'object') return 'object'
    
    return typeof val
})

// For editing field key
const isEditingKey = ref(false)
const editingKeyValue = ref(props.fieldKey)

function startEditingKey() {
    if (props.readonly) return
    isEditingKey.value = true
    editingKeyValue.value = props.fieldKey
}

function saveKey() {
    if (editingKeyValue.value && editingKeyValue.value !== props.fieldKey) {
        emit('update:fieldKey', editingKeyValue.value)
    }
    isEditingKey.value = false
}

// Helper functions for date conversion
function jsDateToCalendarDate(date: Date): CalendarDate {
    return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

function jsDateToCalendarDateTime(date: Date): CalendarDateTime {
    return new CalendarDateTime(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds()
    )
}

function jsDateToTime(date: Date): Time {
    return new Time(date.getHours(), date.getMinutes(), date.getSeconds())
}

function stringToCalendarDate(str: string): CalendarDate {
    try {
        return parseDate(str)
    } catch {
        return jsDateToCalendarDate(new Date())
    }
}

function stringToCalendarDateTime(str: string): CalendarDateTime {
    try {
        return parseDateTime(str)
    } catch {
        return jsDateToCalendarDateTime(new Date())
    }
}

// Type conversion
function convertType(newType: string) {
    switch (newType) {
        case 'string':
            if (isDateObject(modelValue.value)) {
                modelValue.value = (modelValue.value as Date).toISOString()
            } else {
                modelValue.value = String(modelValue.value || '')
            }
            break
        case 'number':
            modelValue.value = Number(modelValue.value) || 0
            break
        case 'boolean':
            modelValue.value = Boolean(modelValue.value)
            break
        case 'null':
            modelValue.value = null
            break
        case 'date':
            // Convert to date-only ISO string (YYYY-MM-DD)
            const dateVal = typeof modelValue.value === 'string' 
                ? new Date(modelValue.value) 
                : new Date()
            modelValue.value = dateVal.toISOString().split('T')[0]!
            break
        case 'datetime':
            // Convert to full ISO datetime string
            const dateTimeVal = typeof modelValue.value === 'string' 
                ? new Date(modelValue.value) 
                : new Date()
            modelValue.value = dateTimeVal.toISOString()
            break
        case 'string-array':
            // Convert current value to a string array
            if (Array.isArray(modelValue.value)) {
                modelValue.value = modelValue.value.map(item => String(item))
            } else {
                modelValue.value = [String(modelValue.value || '')]
            }
            break
        case 'array':
            if (!Array.isArray(modelValue.value)) {
                modelValue.value = []
            }
            break
        case 'object':
            modelValue.value = {}
            break
    }
}

// Array operations
function addArrayItem() {
    if (!Array.isArray(modelValue.value)) return
    
    // If array is empty, default to string
    if (modelValue.value.length === 0) {
        modelValue.value.push('')
        return
    }
    
    // Determine type of new item based on existing items
    const firstItem = modelValue.value[0]
    
    if (firstItem === null) {
        modelValue.value.push(null)
    } else if (Array.isArray(firstItem)) {
        modelValue.value.push([])
    } else if (typeof firstItem === 'object') {
        modelValue.value.push({})
    } else if (typeof firstItem === 'string') {
        modelValue.value.push('')
    } else if (typeof firstItem === 'number') {
        modelValue.value.push(0)
    } else if (typeof firstItem === 'boolean') {
        modelValue.value.push(false)
    } else {
        modelValue.value.push('')
    }
}

function removeArrayItem(index: number) {
    if (!Array.isArray(modelValue.value)) return
    modelValue.value.splice(index, 1)
}

// Object operations
function addObjectField() {
    if (typeof modelValue.value !== 'object' || Array.isArray(modelValue.value) || !modelValue.value || isDateObject(modelValue.value)) return
    
    const obj = modelValue.value as Record<string, YamlValue>
    const newKey = `field_${Object.keys(obj).length + 1}`
    obj[newKey] = ''
}

function removeObjectField(key: string) {
    if (typeof modelValue.value !== 'object' || Array.isArray(modelValue.value) || !modelValue.value || isDateObject(modelValue.value)) return
    const obj = modelValue.value as Record<string, YamlValue>
    delete obj[key]
}

// Collapsed state for objects and arrays
const isCollapsed = ref(false)

// Indentation based on depth
const indentClass = computed(() => {
    return props.depth > 0 ? 'ml-4 pl-4 border-l border-default/50' : ''
})

// Type options for dropdown
const typeOptions: DropdownMenuItem[] = [
    { label: 'Text', value: 'string', icon: 'i-heroicons-bars-3-bottom-left', onSelect: () => handleTypeChangeSelected('string') },
    { label: 'Number', value: 'number', icon: 'i-heroicons-hashtag', onSelect: () => handleTypeChangeSelected('number') },
    { label: 'Boolean', value: 'boolean', icon: 'i-heroicons-check-circle', onSelect: () => handleTypeChangeSelected('boolean') },
    { label: 'Date', value: 'date', icon: 'i-heroicons-calendar', onSelect: () => handleTypeChangeSelected('date') },
    { label: 'Date & Time', value: 'datetime', icon: 'i-heroicons-clock', onSelect: () => handleTypeChangeSelected('datetime') },
    { label: 'Tags', value: 'string-array', icon: 'i-heroicons-tag', onSelect: () => handleTypeChangeSelected('string-array') },
    { label: 'Array', value: 'array', icon: 'i-heroicons-list-bullet', onSelect: () => handleTypeChangeSelected('array') },
    { label: 'Object', value: 'object', icon: 'i-heroicons-cube', onSelect: () => handleTypeChangeSelected('object') },
    { label: 'Null', value: 'null', icon: 'i-heroicons-minus-circle', onSelect: () => handleTypeChangeSelected('null') },
]

// Selected type for the dropdown
const selectedType = computed(() => typeOptions.find(t => t.value === valueType.value))

// Handle type change
function handleTypeChange(option: typeof typeOptions[0] | null) {
    if (option && option.value !== unref(valueType)) {
        convertType(option.value)
    }
}

function handleTypeChangeSelected(typeOption: string | null) {
    if (typeOption && typeOption !== unref(valueType)) {
        convertType(typeOption)
    }
}
</script>

<template>
    <div :class="indentClass" class="space-y-2">
        <!-- Field Header (Key + Type + Actions) -->
        <div class="flex items-center gap-2">
            <!-- Field Key (editable) -->
            <div class="flex-1 min-w-0">
                <UInput
                    v-if="isEditingKey"
                    v-model="editingKeyValue"
                    size="sm"
                    autofocus
                    @blur="saveKey"
                    @keydown.enter="saveKey"
                    @keydown.esc="isEditingKey = false"
                />
                <button
                    v-else
                    class="text-sm font-medium text-left w-full hover:text-primary transition-colors truncate"
                    :class="{ 'cursor-not-allowed': readonly }"
                    @click="startEditingKey"
                >
                    {{ fieldKey }}
                </button>
            </div>

            <!-- Collapse toggle for objects/arrays -->
            <UButton
                v-if="valueType === 'object' || valueType === 'array'"
                :icon="isCollapsed ? 'i-heroicons-chevron-right' : 'i-heroicons-chevron-down'"
                variant="ghost"
                size="xs"
                @click="isCollapsed = !isCollapsed"
            />

            <!-- Type selector -->
            <UDropdownMenu
                :items="typeOptions"
                :disabled="readonly"
            />

            <!-- Remove button -->
            <UButton
                v-if="!readonly"
                icon="i-heroicons-trash"
                variant="ghost"
                size="xs"
                color="error"
                @click="emit('remove')"
            />
        </div>

        <!-- Value Input (collapsed check) -->
        <div v-if="!isCollapsed" class="space-y-2">
            <!-- String -->
            <UInput
                v-if="valueType === 'string'"
                :model-value="String(modelValue)"
                size="sm"
                :disabled="readonly"
                placeholder="Enter text..."
                @update:model-value="(val: string) => modelValue = val"
            />

            <!-- Number -->
            <UInputNumber
                v-else-if="valueType === 'number'"
                :model-value="Number(modelValue)"
                size="sm"
                :disabled="readonly"
                @update:model-value="(val: number | null) => modelValue = val ?? 0"
            />

            <!-- Boolean -->
            <USwitch
                v-else-if="valueType === 'boolean'"
                :model-value="Boolean(modelValue)"
                :disabled="readonly"
                @update:model-value="(val: boolean) => modelValue = val"
            />

            <!-- Date (Date only, no time) -->
            <UInputDate
                v-else-if="valueType === 'date'"
                :model-value="typeof modelValue === 'string' ? stringToCalendarDate(modelValue) : jsDateToCalendarDate(new Date())"
                size="sm"
                :disabled="readonly"
                @update:model-value="(val) => {
                    if (val && 'year' in val) {
                        modelValue = `${val.year}-${String(val.month).padStart(2, '0')}-${String(val.day).padStart(2, '0')}`
                    }
                }"
            />

            <!-- DateTime (Date + Time) -->
            <div v-else-if="valueType === 'datetime'" class="space-y-2">
                <UInputDate
                    :model-value="typeof modelValue === 'string' ? stringToCalendarDateTime(modelValue) : jsDateToCalendarDateTime(new Date())"
                    size="sm"
                    :disabled="readonly"
                    granularity="second"
                    @update:model-value="(val) => {
                        if (val && 'year' in val && 'month' in val && 'day' in val) {
                            // Parse current time if exists
                            const currentDateTime = typeof modelValue === 'string' ? stringToCalendarDateTime(modelValue) : jsDateToCalendarDateTime(new Date())
                            const hour = 'hour' in val ? val.hour : currentDateTime.hour
                            const minute = 'minute' in val ? val.minute : currentDateTime.minute
                            const second = 'second' in val ? val.second : currentDateTime.second
                            
                            const newDateTime = new CalendarDateTime(val.year, val.month, val.day, hour, minute, second)
                            modelValue = newDateTime.toString()
                        }
                    }"
                />
                <UInputTime
                    :model-value="typeof modelValue === 'string' ? stringToCalendarDateTime(modelValue) : jsDateToCalendarDateTime(new Date())"
                    size="sm"
                    :disabled="readonly"
                    granularity="second"
                    @update:model-value="(val) => {
                        if (val && 'hour' in val && 'minute' in val) {
                            // Parse current date if exists
                            const currentDateTime = typeof modelValue === 'string' ? stringToCalendarDateTime(modelValue) : jsDateToCalendarDateTime(new Date())
                            const second = 'second' in val ? val.second : currentDateTime.second
                            
                            const newDateTime = new CalendarDateTime(
                                currentDateTime.year,
                                currentDateTime.month,
                                currentDateTime.day,
                                val.hour,
                                val.minute,
                                second
                            )
                            modelValue = newDateTime.toString()
                        }
                    }"
                />
            </div>

            <!-- String Array (Tags) -->
            <UInputTags
                v-else-if="valueType === 'string-array'"
                :model-value="Array.isArray(modelValue) ? modelValue as string[] : []"
                size="sm"
                :disabled="readonly"
                placeholder="Add tags..."
                @update:model-value="(val: string[]) => modelValue = val"
            />

            <!-- Null -->
            <div v-else-if="valueType === 'null'" class="text-sm text-muted italic">
                null
            </div>

            <!-- Array (Complex items - objects/arrays) -->
            <div v-else-if="valueType === 'array'" class="space-y-2">
                <div
                    v-if="Array.isArray(modelValue) && modelValue.length === 0"
                    class="text-center py-4 text-sm text-muted border border-dashed border-default rounded-lg"
                >
                    <UIcon name="i-heroicons-queue-list" class="w-8 h-8 mx-auto mb-2 opacity-50" />
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
                                @update:model-value="(val: YamlValue) => { 
                                    if (Array.isArray(modelValue)) modelValue[index] = val 
                                }"
                                @remove="removeArrayItem(index)"
                            />
                        </div>
                    </div>
                </template>

                <UButton
                    v-if="!readonly"
                    icon="i-heroicons-plus"
                    label="Add Item"
                    variant="soft"
                    size="xs"
                    class="w-full"
                    @click="addArrayItem"
                />
            </div>

            <!-- Object -->
            <div v-else-if="valueType === 'object'" class="space-y-2">
                <div
                    v-if="typeof modelValue === 'object' && !Array.isArray(modelValue) && modelValue !== null && !isDateObject(modelValue) && Object.keys(modelValue as Record<string, YamlValue>).length === 0"
                    class="text-center py-4 text-sm text-muted border border-dashed border-default rounded-lg"
                >
                    <UIcon name="i-heroicons-cube-transparent" class="w-8 h-8 mx-auto mb-2 opacity-50" />
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

                <UButton
                    v-if="!readonly"
                    icon="i-heroicons-plus"
                    label="Add Field"
                    variant="soft"
                    size="xs"
                    class="w-full"
                    @click="addObjectField"
                />
            </div>
        </div>
    </div>
</template>
