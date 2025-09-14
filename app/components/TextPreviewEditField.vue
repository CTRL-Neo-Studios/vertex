<script setup lang="ts">
import {EditableRoot, EditableArea, EditablePreview, EditableInput, EditableEditTrigger} from "reka-ui";

const modelValue = defineModel<string>()
const emit = defineEmits<{
    (e: 'on-rename'): void
}>()
</script>

<template>
    <div>
        <EditableRoot
            v-slot="{isEditing}"
            placeholder="Rename your file..."
            auto-resize
            v-model="modelValue"
            @submit="(value) => {
                emit('on-rename')
            }"
        >
            <EditableArea class="text-highlighted text-sm text-center">
                <EditablePreview/>
                <EditableInput class="w-full"/>
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