<script setup lang="ts">
/**
 * YAML Field Input - Renders input components for simple field types
 * 
 * Handles rendering of all primitive/simple type inputs:
 * - String (UInput)
 * - Textarea (UTextarea)
 * - Number (UInputNumber)
 * - Boolean (USwitch)
 * - Date (UInputDate)
 * - DateTime (UInputDate with granularity)
 * - Tags (UInputTags)
 * - Null (UInput disabled)
 * 
 * Custom field types can be rendered via slots.
 */

import { CalendarDate, CalendarDateTime, parseDate, parseDateTime } from '@internationalized/date'
import type { YamlFieldType } from '~/composables/editor/useYamlFieldTypes'

type YamlValue = string | number | boolean | null | Date | YamlValue[] | { [key: string]: YamlValue }

const modelValue = defineModel<YamlValue>({ required: true })

const props = withDefaults(defineProps<{
    /** Type of the field (string, number, boolean, etc.) */
    valueType: string
    /** Whether the field is read-only */
    readonly?: boolean
    /** Optional field type definition for custom component detection */
    fieldType?: YamlFieldType
}>(), {
    readonly: false
})

// Helper: Check if value is a Date object
function isDateObject(val: any): val is Date {
    return val instanceof Date && !isNaN(val.getTime())
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

// Check if this type has a custom component (via slot)
const hasCustomComponent = computed(() => {
    return props.fieldType?.component !== undefined
})

// Slot name for custom component
const customSlotName = computed(() => {
    return props.fieldType?.component ? `field-${props.fieldType.component}` : undefined
})
</script>

<template>
    <!-- Custom Component via Slot -->
    <slot
        v-if="hasCustomComponent && customSlotName"
        :name="customSlotName"
        :model-value="modelValue"
        :readonly="readonly"
        :value-type="valueType"
    />

    <!-- Built-in Input Components -->
    <template v-else>
        <!-- String -->
        <UInput
            v-if="valueType === 'string'"
            :model-value="String(modelValue)"
            size="xs"
            :disabled="readonly"
            placeholder="Enter text..."
            @update:model-value="(val: string) => modelValue = val"
        />

        <!-- Textarea (Long Text) -->
        <UTextarea
            v-else-if="valueType === 'textarea'"
            :model-value="String(modelValue)"
            size="xs"
            :disabled="readonly"
            placeholder="Enter long text..."
            :rows="4"
            autoresize
            @update:model-value="(val: string) => modelValue = val"
        />

        <!-- Number -->
        <UInputNumber
            v-else-if="valueType === 'number'"
            :model-value="Number(modelValue)"
            size="xs"
            :disabled="readonly"
            placeholder="0"
            @update:model-value="(val: number | null) => modelValue = val ?? 0"
        />

        <!-- Boolean -->
        <USwitch
            v-else-if="valueType === 'boolean'"
            :model-value="Boolean(modelValue)"
            size="xs"
            :disabled="readonly"
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

        <!-- DateTime (Date + Time) - UInputDate handles both with granularity -->
        <UInputDate
            v-else-if="valueType === 'datetime'"
            :model-value="typeof modelValue === 'string' ? stringToCalendarDateTime(modelValue) : jsDateToCalendarDateTime(new Date())"
            size="xs"
            :disabled="readonly"
            granularity="second"
            @update:model-value="(val: any) => {
                if (val && 'year' in val && 'month' in val && 'day' in val) {
                    // UInputDate with granularity='second' provides hour, minute, second
                    const hour = 'hour' in val ? val.hour : 0
                    const minute = 'minute' in val ? val.minute : 0
                    const second = 'second' in val ? val.second : 0
                    
                    const newDateTime = new CalendarDateTime(val.year, val.month, val.day, hour, minute, second)
                    // Convert to ISO 8601 format
                    const isoString = `${newDateTime.year}-${String(newDateTime.month).padStart(2, '0')}-${String(newDateTime.day).padStart(2, '0')}T${String(newDateTime.hour).padStart(2, '0')}:${String(newDateTime.minute).padStart(2, '0')}:${String(newDateTime.second).padStart(2, '0')}`
                    modelValue = isoString
                }
            }"
        />

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

        <!-- Fallback for unknown types -->
        <UInput
            v-else
            :model-value="String(modelValue || '')"
            size="xs"
            :disabled="readonly"
            placeholder="Enter value..."
            @update:model-value="(val: string) => modelValue = val"
        />
    </template>
</template>
