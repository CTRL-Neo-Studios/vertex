<script setup lang="ts">
import {ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport} from "reka-ui";

/**
 * Flexible layout wrapper for different viewer/editor types.
 * 
 * Supports:
 * - Different scroll behaviors (vertical, both, none)
 * - Optional header with breadcrumbs
 * - Optional status bar
 * - Customizable content area
 * - Different alignment strategies
 */

const fileName = defineModel<string>('fileName')

type ScrollMode = 'vertical' | 'both' | 'none'
type ContentAlignment = 'center' | 'start' | 'stretch'

const props = withDefaults(defineProps<{
    // Header configuration
    showHeader?: boolean,
    showBreadcrumbs?: boolean,
    renaming?: boolean,
    filePath?: string,
    
    // Scroll configuration
    scrollMode?: ScrollMode,
    showScrollbar?: boolean,
    
    // Status bar configuration
    showStatusBar?: boolean,
    
    // Content area configuration
    contentAlignment?: ContentAlignment,
    contentMaxWidth?: string,
    contentPadding?: boolean,
    cursorText?: boolean,
    
    // Layout spacing
    topSpacing?: boolean,
    bottomSpacing?: boolean,
}>(), {
    // Defaults
    showHeader: true,
    showBreadcrumbs: true,
    renaming: false,
    filePath: '',
    scrollMode: 'vertical',
    showScrollbar: true,
    showStatusBar: true,
    contentAlignment: 'center',
    contentMaxWidth: 'max-w-2xl',
    contentPadding: true,
    cursorText: true,
    topSpacing: true,
    bottomSpacing: true,
})

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
}>()

// Compute classes based on props
const contentClasses = computed(() => {
    const classes = ['flex flex-col', 'w-full']
    
    // Alignment
    if (props.contentAlignment === 'center') {
        classes.push('items-center')
    } else if (props.contentAlignment === 'start') {
        classes.push('items-start')
    } else if (props.contentAlignment === 'stretch') {
        classes.push('items-stretch')
    }
    
    classes.push('justify-start')
    
    // Padding
    if (props.contentPadding) {
        classes.push('md:p-0')
    }
    
    // Spacing
    if (props.bottomSpacing) {
        classes.push('mb-32')
    }
    if (props.topSpacing) {
        classes.push('mt-10')
    }
    
    // Cursor
    if (props.cursorText) {
        classes.push('cursor-text')
    }
    
    return classes.join(' ')
})

const viewportClasses = computed(() => {
    const classes = ['w-full']
    
    if (props.scrollMode === 'vertical') {
        classes.push('flex-none h-full')
    } else if (props.scrollMode === 'both') {
        classes.push('flex-none')
    } else if (props.scrollMode === 'none') {
        classes.push('flex-none h-full overflow-hidden')
    }
    
    if (props.cursorText) {
        classes.push('cursor-text')
    }
    
    return classes.join(' ')
})
</script>

<template>
    <!-- Root container with conditional scroll -->
    <div 
        v-if="scrollMode === 'none'"
        class="w-full h-full flex flex-col relative"
        :style="{ height: 'calc(100vh - var(--ui-header-height) - 0.0rem)' }"
    >
        <!-- Header (no scroll) -->
        <div v-if="showHeader" class="absolute z-10 bg-linear-to-t from-transparent via-default to-default left-0 right-0 top-0 h-10">
            <div class="w-full flex items-center justify-center p-2 relative">
                <slot name="header-left"/>
                <template v-if="showBreadcrumbs" >
                    <div class="flex items-center justify-center absolute top-2 left-1/2 -translate-x-1/2">
                        <EditorHeaderBreadcrumbs
                            :renaming="renaming"
                            v-model="fileName"
                            :relativeFilePath="filePath"
                            @on-rename="(oldValue, newValue) => emit('on-rename', oldValue, newValue)"
                            class="w-fit"
                        />
                    </div>
                    <div class="grow"/>
                </template>
                <div v-else class="grow"/>
                <slot name="header-right"/>
            </div>
        </div>

        <!-- Content (no scroll) -->
        <div :class="contentClasses">
            <slot :content-width-class="contentMaxWidth"/>
        </div>

        <!-- Status bar (no scroll) -->
        <div v-if="showStatusBar" class="bg-default absolute z-10 left-0 right-0 bottom-0 h-fit">
            <div class="bg-submuted inline-flex justify-center items-center w-full border-t border-default p-1 px-3 pb-1.5">
                <slot name="status-bar"/>
            </div>
        </div>
    </div>

    <!-- Root container with scroll -->
    <ScrollAreaRoot
        v-else
        class="w-full h-full flex flex-col relative"
        :style="{ height: 'calc(100vh - var(--ui-header-height) - 0.0rem)' }"
    >
        <!-- Header (with scroll) -->
        <div v-if="showHeader" class="absolute z-10 bg-linear-to-t from-transparent via-default to-default left-0 right-0 top-0 h-10">
            <div class="w-full flex items-center justify-center p-2">
                <slot name="header-left"/>
                <div v-if="showBreadcrumbs" class="grow flex items-center justify-center">
                    <EditorHeaderBreadcrumbs 
                        :renaming="renaming" 
                        v-model="fileName" 
                        :relativeFilePath="filePath" 
                        @on-rename="(oldValue, newValue) => emit('on-rename', oldValue, newValue)" 
                        class="w-fit"
                    />
                </div>
                <div v-else class="grow"/>
                <slot name="header-right"/>
            </div>
        </div>

        <!-- Scroll Viewport -->
        <ScrollAreaViewport :class="viewportClasses">
            <div :class="contentClasses">
                <slot :content-width-class="contentMaxWidth"/>
            </div>
        </ScrollAreaViewport>

        <!-- Status bar (with scroll) -->
        <div v-if="showStatusBar" class="bg-default absolute z-10 left-0 right-0 bottom-0 h-fit">
            <div class="bg-submuted inline-flex justify-start items-center w-full border-t border-default p-1 px-3 pb-1.5">
                <slot name="status-bar"/>
            </div>
        </div>

        <!-- Scrollbar (vertical) -->
        <ScrollAreaScrollbar
            v-if="showScrollbar && scrollMode === 'vertical'"
            class="select-none touch-none z-20 w-2 m-2 pointer-events-none"
            orientation="vertical"
        >
            <ScrollAreaThumb class="flex-1 bg-accented rounded-lg"/>
        </ScrollAreaScrollbar>

        <!-- Scrollbars (both) -->
        <template v-if="showScrollbar && scrollMode === 'both'">
            <ScrollAreaScrollbar
                class="select-none touch-none z-20 w-2 m-2 pointer-events-none"
                orientation="vertical"
            >
                <ScrollAreaThumb class="flex-1 bg-accented rounded-lg"/>
            </ScrollAreaScrollbar>
            <ScrollAreaScrollbar
                class="select-none touch-none z-20 h-2 m-2 pointer-events-none"
                orientation="horizontal"
            >
                <ScrollAreaThumb class="flex-1 bg-accented rounded-lg"/>
            </ScrollAreaScrollbar>
        </template>
    </ScrollAreaRoot>
</template>

<style scoped>

</style>