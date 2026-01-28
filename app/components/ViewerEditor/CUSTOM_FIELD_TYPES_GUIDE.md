# Custom Field Types Guide

## Overview

The YAML Form Editor now uses a **schema-driven architecture** that makes it easy to add new field types without modifying multiple files. All field type definitions are centralized in `~/composables/editor/useYamlFieldTypes.ts`.

## Architecture

### Single Source of Truth

All field types are defined in one place: `useYamlFieldTypes.ts`

```typescript
export interface YamlFieldType {
    type: string           // Unique identifier (e.g., 'string', 'image')
    label: string          // Display name (e.g., 'Text', 'Image')
    icon: string           // Lucide icon name (e.g., 'i-lucide-type')
    defaultValue: any      // Default value when creating field
    component?: string     // Optional slot name for custom rendering
    detect?: (value: any) => boolean  // Auto-detection function
}
```

### How It Works

1. **Type Registry**: All field types are defined in `DEFAULT_FIELD_TYPES` array
2. **Auto-Detection**: Each type can have a `detect` function for auto-typing
3. **Default Values**: Each type defines its default value (or a factory function)
4. **Custom Components**: Types can specify a custom component via slots
5. **Icon Mapping**: Icons are automatically used in dropdowns and type indicators

## Adding a New Built-in Type

### Step 1: Add to Registry

Edit `app/composables/editor/useYamlFieldTypes.ts`:

```typescript
export const DEFAULT_FIELD_TYPES: YamlFieldType[] = [
    // ... existing types ...
    
    {
        type: 'color',
        label: 'Color',
        icon: 'i-lucide-palette',
        defaultValue: '#000000',
        detect: (value) => typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)
    },
]
```

That's it! The type will now:
- ✅ Appear in all "Add Field" dropdowns
- ✅ Appear in type conversion dropdowns
- ✅ Be auto-detected for existing values
- ✅ Use correct default value when created
- ✅ Show the correct icon everywhere

**No need to modify any component files!**

## Adding Custom Field Types (Runtime)

### Basic Custom Type

You can provide custom types at runtime:

```vue
<script setup lang="ts">
import type { YamlFieldType } from '~/composables/editor/useYamlFieldTypes'

const customTypes: YamlFieldType[] = [
    {
        type: 'email',
        label: 'Email',
        icon: 'i-lucide-mail',
        defaultValue: '',
        detect: (value) => typeof value === 'string' && /^[^@]+@[^@]+\.[^@]+$/.test(value)
    },
    {
        type: 'url',
        label: 'URL',
        icon: 'i-lucide-link',
        defaultValue: 'https://',
        detect: (value) => typeof value === 'string' && value.startsWith('http')
    }
]

const data = ref({})
</script>

<template>
    <YamlForm v-model="data" :field-types="customTypes" />
</template>
```

## Custom Components with Slots

### Basic Example: Color Picker

```vue
<script setup lang="ts">
import type { YamlFieldType } from '~/composables/editor/useYamlFieldTypes'

const customTypes: YamlFieldType[] = [
    {
        type: 'color',
        label: 'Color',
        icon: 'i-lucide-palette',
        defaultValue: '#000000',
        component: 'color',  // This enables slot-based rendering
        detect: (value) => typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)
    }
]

const data = ref({
    primaryColor: '#ff0000',
    secondaryColor: '#00ff00'
})
</script>

<template>
    <YamlForm v-model="data" :field-types="customTypes">
        <!-- Custom component slot -->
        <template #field-color="{ modelValue, readonly }">
            <input 
                type="color" 
                :value="modelValue" 
                @input="$emit('update:modelValue', $event.target.value)"
                :disabled="readonly"
                class="w-full h-10 rounded cursor-pointer"
            />
        </template>
    </YamlForm>
</template>
```

### Advanced Example: Image Upload

```vue
<script setup lang="ts">
const customTypes: YamlFieldType[] = [
    {
        type: 'image',
        label: 'Image',
        icon: 'i-lucide-image',
        defaultValue: '',
        component: 'image',
        detect: (value) => typeof value === 'string' && 
            (value.endsWith('.jpg') || value.endsWith('.png') || value.endsWith('.webp'))
    }
]
</script>

<template>
    <YamlForm v-model="data" :field-types="customTypes">
        <template #field-image="{ modelValue, readonly, updateValue }">
            <MyImageUploader 
                v-model="modelValue" 
                :disabled="readonly"
                @update:modelValue="updateValue"
            />
        </template>
    </YamlForm>
</template>
```

### Slot Props

When using custom component slots, you receive these props:

```typescript
{
    modelValue: any,           // Current value
    readonly: boolean,         // Whether field is read-only
    fieldKey: string,          // Field name
    depth: number,             // Nesting depth
    // ... other props
}
```

## Slot Naming Convention

Slots follow this pattern: `#field-{component}`

Where `{component}` is the value from the `component` property in your field type definition.

Examples:
- `component: 'color'` → `#field-color`
- `component: 'image'` → `#field-image`
- `component: 'rich-text'` → `#field-rich-text`

## Override Built-in Types

You can override built-in types by providing a custom type with the same `type` identifier:

```vue
<script setup lang="ts">
// Override the built-in 'string' type
const customTypes: YamlFieldType[] = [
    {
        type: 'string',  // Same as built-in
        label: 'Rich Text',
        icon: 'i-lucide-text',
        defaultValue: '',
        component: 'rich-text'  // Now uses custom component
    }
]
</script>

<template>
    <YamlForm v-model="data" :field-types="customTypes">
        <template #field-rich-text="{ modelValue }">
            <MyRichTextEditor v-model="modelValue" />
        </template>
    </YamlForm>
</template>
```

## Complex Example: All Features

```vue
<script setup lang="ts">
import type { YamlFieldType } from '~/composables/editor/useYamlFieldTypes'

const customTypes: YamlFieldType[] = [
    // Simple type (uses built-in input)
    {
        type: 'email',
        label: 'Email',
        icon: 'i-lucide-mail',
        defaultValue: '',
        detect: (v) => typeof v === 'string' && v.includes('@')
    },
    
    // Type with custom component
    {
        type: 'color',
        label: 'Color',
        icon: 'i-lucide-palette',
        defaultValue: '#000000',
        component: 'color'
    },
    
    // Type with dynamic default (function)
    {
        type: 'uuid',
        label: 'UUID',
        icon: 'i-lucide-fingerprint',
        defaultValue: () => crypto.randomUUID(),
        detect: (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    },
    
    // Override built-in type
    {
        type: 'string',
        label: 'Markdown',
        icon: 'i-lucide-file-text',
        defaultValue: '',
        component: 'markdown'
    }
]

const formData = ref({
    email: 'user@example.com',
    primaryColor: '#ff0000',
    id: crypto.randomUUID(),
    content: '# Hello World'
})
</script>

<template>
    <YamlForm v-model="formData" :field-types="customTypes">
        <!-- Color picker -->
        <template #field-color="{ modelValue, readonly }">
            <div class="flex gap-2 items-center">
                <input 
                    type="color" 
                    :value="modelValue" 
                    @input="modelValue = $event.target.value"
                    :disabled="readonly"
                    class="w-12 h-12 rounded cursor-pointer"
                />
                <UInput :model-value="modelValue" readonly />
            </div>
        </template>
        
        <!-- Markdown editor -->
        <template #field-markdown="{ modelValue, readonly }">
            <MyMarkdownEditor 
                v-model="modelValue" 
                :read-only="readonly"
                :min-height="200"
            />
        </template>
    </YamlForm>
</template>
```

## Benefits

### Before (Hardcoded)

To add a new type, you had to modify:
1. ❌ `YamlFormField.vue` - Add to `typeOptions`
2. ❌ `YamlFormField.vue` - Add to `selectedType` icon map
3. ❌ `YamlFormField.vue` - Add to `addFieldOptions`
4. ❌ `YamlFormField.vue` - Add to `addArrayItemOptions`
5. ❌ `YamlFormField.vue` - Add to `convertType` switch
6. ❌ `YamlFormField.vue` - Add to `addObjectField` switch
7. ❌ `YamlFormField.vue` - Add to `addArrayItem` switch
8. ❌ `YamlForm.vue` - Add to `addField` switch
9. ❌ `YamlForm.vue` - Add to `addFieldOptions`

### After (Schema-Driven)

To add a new type:
1. ✅ Add one entry to `DEFAULT_FIELD_TYPES` array

That's it! Everything else updates automatically.

## Type Detection Priority

When auto-detecting types, the order matters:
1. First matching `detect` function wins
2. Types are checked in array order
3. More specific types should come before general types

Example order:
```typescript
[
    // Specific types first
    { type: 'datetime', detect: (v) => isDateTimeString(v) },
    { type: 'date', detect: (v) => isDateString(v) },
    { type: 'string-array', detect: (v) => isStringArray(v) },
    
    // General types last
    { type: 'string', detect: (v) => typeof v === 'string' },
    { type: 'array', detect: (v) => Array.isArray(v) },
]
```

## Best Practices

1. **Unique Type Names**: Use descriptive, unique type identifiers
2. **Lucide Icons**: Always use lucide icons for consistency (prefix: `i-lucide-`)
3. **Detection Functions**: Make detection functions specific and fast
4. **Default Values**: Use factory functions for dynamic defaults
5. **Component Slots**: Keep slot names short and descriptive
6. **Documentation**: Document custom types in your project

## Migration Guide

### From Hardcoded to Schema

If you have custom modifications, here's how to migrate:

**Old Way** (YamlFormField.vue):
```typescript
case 'color':
    obj[newKey] = '#000000'
    break
```

**New Way** (useYamlFieldTypes.ts):
```typescript
{
    type: 'color',
    label: 'Color',
    icon: 'i-lucide-palette',
    defaultValue: '#000000'
}
```

All other logic (dropdowns, type conversion, etc.) updates automatically!
