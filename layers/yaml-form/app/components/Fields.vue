<script setup lang="ts">
import type {YamlFieldType, YamlFormData} from '@type32/yaml-editor-form'

const data = defineModel<YamlFormData>({ required: true })
withDefaults(defineProps<{ size?: "xl" | "lg" | "md" | "sm" | "xs", disabled?: boolean }>(), {
    size: 'sm',
    disabled: false
})
const {t} = useI18n()
// The form's types beyond the package's own: a hex color, edited with a color picker.
const fields: YamlFieldType[] = [
    {
        type: 'color',
        defaultValue: '#FFFFFF',
        component: 'color',
        baseType: 'string',
        icon: 'i-lucide-palette',
        label: t('plugins.yaml-form.color'),
        detect: (value) => typeof value === 'string' && /^#([A-Fa-f0-9]{3}){1,2}$|^#([A-Fa-f0-9]{4}){1,2}$/.test(value)
    },
]
</script>

<template>
    <YamlFormEditor :readonly="disabled" class="w-full" :size="size" v-model="data" :field-types="fields">
        <template #field-color="{ modelValue, updateModelValue, readonly }">
            <UColorPicker :disabled="readonly" :modelValue="modelValue as string" @update:modelValue="(value) => updateModelValue(value as string)"/>
        </template>
    </YamlFormEditor>
</template>
