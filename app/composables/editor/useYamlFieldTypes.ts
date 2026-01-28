import type { CalendarDate, CalendarDateTime } from '@internationalized/date'

/**
 * YAML Field Type Definition
 * Centralized schema for all field types supported by the YAML editor
 */
export interface YamlFieldType {
    /** Unique type identifier */
    type: string
    /** Display label */
    label: string
    /** Lucide icon name */
    icon: string
    /** Default value when creating new field of this type */
    defaultValue: any
    /** Optional slot name for custom component rendering */
    component?: string
    /** Optional detection function for auto-typing existing values */
    detect?: (value: any) => boolean
}

/**
 * Default field types registry
 * This is the single source of truth for all built-in field types
 */
export const DEFAULT_FIELD_TYPES: YamlFieldType[] = [
    {
        type: 'string',
        label: 'Text',
        icon: 'i-lucide-type',
        defaultValue: '',
        detect: (value) => typeof value === 'string' && !isDateString(value) && !isDateTimeString(value)
    },
    {
        type: 'number',
        label: 'Number',
        icon: 'i-lucide-hash',
        defaultValue: 0,
        detect: (value) => typeof value === 'number'
    },
    {
        type: 'boolean',
        label: 'Boolean',
        icon: 'i-lucide-circle-check',
        defaultValue: false,
        detect: (value) => typeof value === 'boolean'
    },
    {
        type: 'date',
        label: 'Date',
        icon: 'i-lucide-calendar',
        defaultValue: () => new Date(),
        detect: (value) => isDateObject(value) || isDateString(value)
    },
    {
        type: 'datetime',
        label: 'Date & Time',
        icon: 'i-lucide-calendar-clock',
        defaultValue: () => new Date(),
        detect: (value) => isDateTimeString(value)
    },
    {
        type: 'string-array',
        label: 'Tags',
        icon: 'i-lucide-tags',
        defaultValue: [],
        detect: (value) => isStringArray(value)
    },
    {
        type: 'array',
        label: 'Array',
        icon: 'i-lucide-list',
        defaultValue: [],
        detect: (value) => Array.isArray(value) && !isStringArray(value)
    },
    {
        type: 'object',
        label: 'Object',
        icon: 'i-lucide-box',
        defaultValue: {},
        detect: (value) => typeof value === 'object' && value !== null && !Array.isArray(value) && !isDateObject(value)
    },
    {
        type: 'null',
        label: 'Null',
        icon: 'i-lucide-circle-slash',
        defaultValue: null,
        detect: (value) => value === null
    }
]

// Helper detection functions
function isDateObject(value: any): boolean {
    return value instanceof Date
}

function isDateString(value: any): boolean {
    if (typeof value !== 'string') return false
    // Match YYYY-MM-DD format
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isDateTimeString(value: any): boolean {
    if (typeof value !== 'string') return false
    // Match ISO 8601 datetime format
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
}

function isStringArray(value: any): boolean {
    return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string')
}

/**
 * Composable for managing YAML field types
 */
export function useYamlFieldTypes(customTypes?: YamlFieldType[]) {
    // Merge custom types with defaults
    const fieldTypes = computed(() => {
        const types = [...DEFAULT_FIELD_TYPES]
        
        if (customTypes) {
            // Add or override with custom types
            for (const customType of customTypes) {
                const existingIndex = types.findIndex(t => t.type === customType.type)
                if (existingIndex >= 0) {
                    types[existingIndex] = customType
                } else {
                    types.push(customType)
                }
            }
        }
        
        return types
    })
    
    /**
     * Get field type definition by type identifier
     */
    const getFieldType = (type: string): YamlFieldType | undefined => {
        return fieldTypes.value.find(t => t.type === type)
    }
    
    /**
     * Detect field type from a value
     */
    const detectFieldType = (value: any): YamlFieldType => {
        for (const fieldType of fieldTypes.value) {
            if (fieldType.detect && fieldType.detect(value)) {
                return fieldType
            }
        }
        // Default to string if no match
        return fieldTypes.value.find(t => t.type === 'string')!
    }
    
    /**
     * Get default value for a field type
     */
    const getDefaultValue = (type: string): any => {
        const fieldType = getFieldType(type)
        if (!fieldType) return ''
        
        // If defaultValue is a function, call it
        return typeof fieldType.defaultValue === 'function' 
            ? fieldType.defaultValue() 
            : fieldType.defaultValue
    }
    
    /**
     * Get icon for a field type
     */
    const getIcon = (type: string): string => {
        return getFieldType(type)?.icon || 'i-lucide-circle-question-mark'
    }
    
    /**
     * Get dropdown menu items for type selection
     */
    const getTypeMenuItems = (onSelect: (type: string) => void) => {
        return fieldTypes.value.map(fieldType => ({
            label: fieldType.label,
            icon: fieldType.icon,
            onSelect: () => onSelect(fieldType.type)
        }))
    }
    
    return {
        fieldTypes,
        getFieldType,
        detectFieldType,
        getDefaultValue,
        getIcon,
        getTypeMenuItems
    }
}
