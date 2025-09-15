<script setup lang="ts">
import { ref, nextTick } from 'vue'

/**
 * Use `defineModel` for two-way binding. This is the modern
 * and recommended way to handle v-model in Vue 3.4+.
 */
const modelValue = defineModel<string>()

const props = defineProps<{
    /**
     * Disables the component, preventing editing.
     */
    disabled?: boolean,
    size?: "xl" | "lg" | "md" | "sm" | "xs"
}>()

const emit = defineEmits<{
    /**
     * Emitted when a new value is saved.
     * @param e 'on-rename' The event name.
     * @param oldValue The value before the edit was saved.
     * @param newValue The value after the edit was saved.
     */
    (e: 'on-rename', oldValue: string, newValue: string): void
}>()

// --- Refs ---

const isEditing = ref(false)
const previousValue = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// --- Functions ---

/**
 * Switches the component to edit mode.
 */
async function startEditing() {
    if (props.disabled) {
        return
    }

    // Store the original value in case of cancellation.
    previousValue.value = modelValue.value || ''
    isEditing.value = true

    // Wait for the DOM to update, then focus and select the input text.
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
}

/**
 * Saves the changes and switches back to display mode.
 * Emits the 'on-rename' event if the value has changed.
 */
function save() {
    if (!isEditing.value) return

    isEditing.value = false

    // Only emit if the value actually changed.
    if (previousValue.value !== modelValue.value) {
        emit('on-rename', previousValue.value, modelValue.value || "")
    }
}

/**
 * Cancels the edit and reverts to the original value.
 */
function cancel() {
    // Revert the model value to what it was before editing started.
    modelValue.value = previousValue.value
    isEditing.value = false
}
</script>

<template>
    <div
        class="inline-block w-full"
        :class="{ 'cursor-not-allowed opacity-60': disabled }"
        @click="startEditing"
    >
        <!-- EDIT MODE: Show the input field -->
        <UInput
            v-if="isEditing"
            ref="inputRef"
            v-model="modelValue"
            type="text"
            class="inline-edit-input"
            :disabled="disabled"
            @keydown.enter.prevent="save"
            @keydown.esc.prevent="cancel"
            @blur="save"
            autofocus
            :size="props?.size ?? 'md'"
        />
        <!-- DISPLAY MODE: Show the text, or a placeholder if empty -->
        <span
            v-else
            class="inline-edit-display"
            :class="{ 'text-muted': !modelValue }"
        >{{ modelValue || 'Click to edit' }}</span>
    </div>
</template>

<style>
@reference "~/assets/css/main.css";
/*
  We use a <style> block to apply shared styles, reducing
  class duplication in the template and making it cleaner.
  This works great with Tailwind's @apply directive.
*/
.inline-edit-input,
.inline-edit-display {
    @apply w-full rounded-md border-transparent leading-tight text-highlighted;
}

.inline-edit-input {
    @apply outline-none border-none text-center w-fit flex items-center justify-center min-w-0;
}

.inline-edit-display {
    /* Provide a subtle visual cue on hover to indicate it's interactive */
    @apply cursor-text;
}
</style>