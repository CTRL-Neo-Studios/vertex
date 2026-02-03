<script setup lang="ts">
/**
 * Image Viewer Component
 * Displays images with zoom, pan, and metadata
 */

const fileName = defineModel<string>('fileName', { required: true })

const props = withDefaults(defineProps<{
    imageSrc: string,
    renaming: boolean,
    filePath?: string,
    disabled?: boolean, // I don't know what to do with this for now, so I'll leave it here
}>(), {
    renaming: false,
    filePath: '',
    disabled: false,
})

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
}>()

const imageRef = ref<HTMLImageElement>()
const imageSize = ref({ width: 0, height: 0 })
const zoom = ref(100)

function handleImageLoad(event: Event) {
    const img = event.target as HTMLImageElement
    imageSize.value = {
        width: img.naturalWidth,
        height: img.naturalHeight
    }
}

function zoomIn() { // I'm temporarily disabling the image zooming func
    zoom.value = Math.min(zoom.value + 10, 200)
}

function zoomOut() {
    zoom.value = Math.max(zoom.value - 10, 10)
}

function resetZoom() {
    zoom.value = 100
}

const fileSizeKB = computed(() => {
    // This would come from actual file metadata
    return '0 KB'
})
</script>

<template>
    <ViewerEditorLayoutWrapper
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"

        scrollMode="none"
        contentAlignment="stretch"
        :contentPadding="false"
        :topSpacing="false"
        :bottomSpacing="false"
        :cursorText="false"
    >
        <template #header-right>
            <div class="flex items-center gap-1">
                <UButton 
                    icon="i-lucide-minus"
                    size="xs"
                    variant="ghost"
                    @click="zoomOut"
                    :disabled="zoom <= 10"
                />
                <UBadge size="sm" variant="subtle" class="font-mono min-w-12 text-center">{{ zoom }}%</UBadge>
                <UButton 
                    icon="i-lucide-plus"
                    size="xs"
                    variant="ghost"
                    @click="zoomIn"
                    :disabled="zoom >= 100"
                />
                <UButton 
                    icon="i-lucide-refresh-ccw"
                    size="xs"
                    variant="ghost"
                    @click="resetZoom"
                />
            </div>
        </template>
        
        <template #default>
            <div class="w-full max-h-svh h-svh pb-6 flex items-center justify-center overflow-hidden bg-muted/30">
                <img
                    ref="imageRef"
                    :src="imageSrc" 
                    :alt="fileName"
                    class="max-w-full max-h-full object-contain transition-transform"
                    :style="{ transform: `scale(${zoom / 100})` }"
                    @load="handleImageLoad"
                />
            </div>
        </template>
        
        <template #status-bar>
            <div class="flex items-center gap-3 text-xs text-dimmed">
                <span class="font-mono">
                    {{ imageSize.width }} × {{ imageSize.height }} px
                </span>
                <USeparator orientation="vertical" class="h-3"/>
                <span class="font-mono">{{ fileSizeKB }}</span>
            </div>
        </template>
    </ViewerEditorLayoutWrapper>
</template>
