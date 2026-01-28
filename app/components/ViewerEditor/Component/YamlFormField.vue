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
import Collapsible from "~/components/Utility/Collapsible.vue";

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

// Type conversion
function convertType(newType: string) {
    const currentType = valueType.value
    
    // Check if conversion is valid
    if (!isValidConversion(currentType, newType)) {
        console.warn(`Invalid conversion from ${currentType} to ${newType}`)
        return
    }
    
    // If converting FROM an array with items to a non-array type, get first item or clear
    const isCurrentlyArray = Array.isArray(modelValue.value)
    const isConvertingToNonArray = !['array', 'string-array'].includes(newType)
    
    let baseValue: YamlValue = modelValue.value
    
    // When converting from array to non-array, use first item if it exists
    if (isCurrentlyArray && isConvertingToNonArray) {
        const arr = modelValue.value as YamlValue[]
        baseValue = arr.length > 0 && arr[0] !== undefined ? arr[0] : ''
    }
    
    switch (newType) {
        case 'string':
            if (isDateObject(baseValue)) {
                modelValue.value = (baseValue as Date).toISOString()
            } else {
                modelValue.value = String(baseValue || '')
            }
            break
        case 'number':
            modelValue.value = Number(baseValue) || 0
            break
        case 'boolean':
            modelValue.value = Boolean(baseValue)
            break
        case 'null':
            modelValue.value = null
            break
        case 'date':
            // Convert to date-only ISO string (YYYY-MM-DD)
            const dateVal = typeof baseValue === 'string' 
                ? new Date(baseValue) 
                : new Date()
            modelValue.value = dateVal.toISOString().split('T')[0]!
            break
        case 'datetime':
            // Convert to full ISO datetime string
            const dateTimeVal = typeof baseValue === 'string' 
                ? new Date(baseValue) 
                : new Date()
            modelValue.value = dateTimeVal.toISOString()
            break
        case 'string-array':
            // Convert current value to a string array
            if (Array.isArray(modelValue.value)) {
                // If already an array, convert items to strings
                modelValue.value = modelValue.value.map(item => String(item))
            } else {
                // Create new array with single item
                modelValue.value = [String(modelValue.value || '')]
            }
            break
        case 'array':
            // Clear array if converting from string-array, otherwise create empty
            if (Array.isArray(modelValue.value) && isStringArray(modelValue.value)) {
                modelValue.value = []
            } else if (!Array.isArray(modelValue.value)) {
                modelValue.value = []
            }
            break
        case 'object':
            modelValue.value = {}
            break
    }
}

// Array operations
function addArrayItem(itemType?: string) {
    if (!Array.isArray(modelValue.value)) return
    
    // If type is specified, add that type
    if (itemType) {
        switch (itemType) {
            case 'string':
                modelValue.value.push('')
                break
            case 'number':
                modelValue.value.push(0)
                break
            case 'boolean':
                modelValue.value.push(false)
                break
            case 'null':
                modelValue.value.push(null)
                break
            case 'array':
                modelValue.value.push([])
                break
            case 'object':
                modelValue.value.push({})
                break
            default:
                modelValue.value.push('')
        }
        return
    }
    
    // If array is empty, check if this is a string-array (tags) or regular array
    // For string-array, the parent already handles it, so this should only happen for regular arrays
    if (modelValue.value.length === 0) {
        // Default to empty object for empty arrays (most common use case)
        modelValue.value.push({})
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
function addObjectField(fieldType?: string) {
    if (typeof modelValue.value !== 'object' || Array.isArray(modelValue.value) || !modelValue.value || isDateObject(modelValue.value)) return
    
    const obj = modelValue.value as Record<string, YamlValue>
    const newKey = `field_${Object.keys(obj).length + 1}`
    
    // Set initial value based on type
    switch (fieldType) {
        case 'string':
            obj[newKey] = ''
            break
        case 'number':
            obj[newKey] = 0
            break
        case 'boolean':
            obj[newKey] = false
            break
        case 'date':
            obj[newKey] = new Date().toISOString().split('T')[0]!
            break
        case 'datetime':
            obj[newKey] = new Date().toISOString()
            break
        case 'null':
            obj[newKey] = null
            break
        case 'string-array':
            obj[newKey] = []
            break
        case 'array':
            obj[newKey] = []
            break
        case 'object':
            obj[newKey] = {}
            break
        default:
            obj[newKey] = ''
    }
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

// Indentation based on depth
const indentClass = computed(() => {
    return props.depth > 0 ? 'pl-2' : ''
})

// Type options for dropdown - filtered by valid conversions
const typeOptions = computed(() => {
    const currentType = valueType.value
    
    const allOptions = [
        { label: 'Text', value: 'string', icon: 'i-heroicons-bars-3-bottom-left' },
        { label: 'Number', value: 'number', icon: 'i-heroicons-hashtag' },
        { label: 'Boolean', value: 'boolean', icon: 'i-heroicons-check-circle' },
        { label: 'Date', value: 'date', icon: 'i-heroicons-calendar' },
        { label: 'Date & Time', value: 'datetime', icon: 'i-heroicons-clock' },
        { label: 'Tags', value: 'string-array', icon: 'i-heroicons-tag' },
        { label: 'Array', value: 'array', icon: 'i-heroicons-list-bullet' },
        { label: 'Object', value: 'object', icon: 'i-heroicons-cube' },
        { label: 'Null', value: 'null', icon: 'i-heroicons-minus-circle' },
    ]
    
    // Filter and map to dropdown items with onSelect
    return allOptions
        .filter(opt => isValidConversion(currentType, opt.value))
        .map(opt => ({
            label: opt.label,
            icon: opt.icon,
            onSelect: () => convertType(opt.value)
        })) as DropdownMenuItem[]
})

// Get icon for current type
const selectedType = computed(() => {
    const iconMap: Record<string, string> = {
        'string': 'i-heroicons-bars-3-bottom-left',
        'number': 'i-heroicons-hashtag',
        'boolean': 'i-heroicons-check-circle',
        'date': 'i-heroicons-calendar',
        'datetime': 'i-heroicons-clock',
        'string-array': 'i-heroicons-tag',
        'array': 'i-heroicons-list-bullet',
        'object': 'i-heroicons-cube',
        'null': 'i-heroicons-minus-circle',
    }
    return {
        icon: iconMap[valueType.value] || 'i-heroicons-question-mark-circle'
    }
})

// Add field options (for creating new fields in objects)
const addFieldOptions: DropdownMenuItem[] = [
    { label: 'Text', icon: 'i-heroicons-bars-3-bottom-left', onSelect: () => addObjectField('string') },
    { label: 'Number', icon: 'i-heroicons-hashtag', onSelect: () => addObjectField('number') },
    { label: 'Boolean', icon: 'i-heroicons-check-circle', onSelect: () => addObjectField('boolean') },
    { label: 'Date', icon: 'i-heroicons-calendar', onSelect: () => addObjectField('date') },
    { label: 'Date & Time', icon: 'i-heroicons-clock', onSelect: () => addObjectField('datetime') },
    { label: 'Tags', icon: 'i-heroicons-tag', onSelect: () => addObjectField('string-array') },
    { label: 'Array', icon: 'i-heroicons-list-bullet', onSelect: () => addObjectField('array') },
    { label: 'Object', icon: 'i-heroicons-cube', onSelect: () => addObjectField('object') },
    { label: 'Null', icon: 'i-heroicons-minus-circle', onSelect: () => addObjectField('null') },
]

// Add array item options (for creating new items in arrays)
const addArrayItemOptions: DropdownMenuItem[] = [
    { label: 'Text', icon: 'i-heroicons-bars-3-bottom-left', onSelect: () => addArrayItem('string') },
    { label: 'Number', icon: 'i-heroicons-hashtag', onSelect: () => addArrayItem('number') },
    { label: 'Boolean', icon: 'i-heroicons-check-circle', onSelect: () => addArrayItem('boolean') },
    { label: 'Array', icon: 'i-heroicons-list-bullet', onSelect: () => addArrayItem('array') },
    { label: 'Object', icon: 'i-heroicons-cube', onSelect: () => addArrayItem('object') },
    { label: 'Null', icon: 'i-heroicons-minus-circle', onSelect: () => addArrayItem('null') },
]
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
            <Collapsible v-else :default-open="isOpen" :label="fieldKey">
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
                                :icon="selectedType?.icon || 'i-heroicons-question-mark-circle'"
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
                        :class="{ 'cursor-not-allowed': readonly || isArrayItem }"
                        @click="isArrayItem ? undefined : startEditingKey"
                        :label="fieldKey"
                        block
                        variant="link"
                        color="neutral"
                        :disabled="isArrayItem"
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
            <div class="space-y-2">
                <!-- String -->
                <UInput
                    v-if="valueType === 'string'"
                    :model-value="String(modelValue)"
                    size="xs"
                    :disabled="readonly"
                    placeholder="Enter text..."
                    @update:model-value="(val: string) => modelValue = val"
                />

                <!-- Number -->
                <UInputNumber
                    v-else-if="valueType === 'number'"
                    :model-value="Number(modelValue)"
                    size="xs"
                    :disabled="readonly"
                    @update:model-value="(val: number | null) => modelValue = val ?? 0"
                />

                <!-- Boolean -->
                <USwitch
                    v-else-if="valueType === 'boolean'"
                    :model-value="Boolean(modelValue)"
                    :disabled="readonly"
                    size="sm"
                    @update:model-value="(val: boolean) => modelValue = val"
                />

                <!-- Date (Date only, no time) -->
                <UInputDate
                    v-else-if="valueType === 'date'"
                    :model-value="typeof modelValue === 'string' ? stringToCalendarDate(modelValue) : jsDateToCalendarDate(new Date())"
                    size="xs"
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
                        size="xs"
                        :disabled="readonly"
                        granularity="second"
                        @update:model-value="(val) => {
                            if (val && 'year' in val && 'month' in val && 'day' in val) {
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
                        size="xs"
                        :disabled="readonly"
                        granularity="second"
                        @update:model-value="(val) => {
                            if (val && 'hour' in val && 'minute' in val) {
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
                    size="xs"
                    :disabled="readonly"
                    placeholder="Add tags..."
                    @update:model-value="(val: string[]) => modelValue = val"
                />

                <!-- Null -->
                <div v-else-if="valueType === 'null'" class="text-xs text-muted italic">
                    null
                </div>
            </div>
        </template>
    </div>
</template>
