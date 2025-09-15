<script setup lang="ts">
import {EditableRoot, EditableArea, EditablePreview, EditableInput, EditableEditTrigger} from "reka-ui";

const modelValue = defineModel<string>()
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{
    (e: 'on-rename', oldValue: string): void
}>()

</script>

<template>
    <div>
        <EditableRoot
            name="edit"
            :disabled="props?.disabled"
            v-slot="{isEditing}"
            placeholder="Rename your file..."
            auto-resize
            v-model:model-value="modelValue"
            submitMode="both"
            @submit="(value) => {
                emit('on-rename', value || '');
            }"
        >
            <EditableArea class="text-highlighted text-sm text-center">
                <EditablePreview/>
                <EditableInput class="w-fit"/>
            </EditableArea>
            <EditableEditTrigger
                v-if="isEditing"
                class="inline-flex items-center justify-center rounded-lg font-medium text-sm"
            />
        </EditableRoot>
    </div>
</template>

<style scoped>

</style>