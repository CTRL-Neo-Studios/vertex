<script setup lang="ts">
import type {YamlFormData} from '@type32/yaml-editor-form'
import {useFrontmatterTypes} from "~/composables/utility/editor/useFrontmatterTypes";

const data = defineModel<YamlFormData>({ required: true })
const fields = useFrontmatterTypes()
const props = withDefaults(defineProps<{ size?: "xl" | "lg" | "md" | "sm" | "xs", disabled?: boolean }>(), {
    size: 'sm',
    disabled: false
})
</script>

<template>
    <YamlFormEditor :readonly="disabled" class="w-full" :size="size" v-model="data" :field-types="fields">
        <template #field-color="{ modelValue, updateModelValue, readonly }">
            <UColorPicker :disabled="readonly" :modelValue="modelValue as string" @update:modelValue="(value) => updateModelValue(value as string)"/>
        </template>
    </YamlFormEditor>
</template>

<style scoped>

</style>