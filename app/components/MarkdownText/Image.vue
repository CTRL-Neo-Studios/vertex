<script setup lang="ts">
import {MARKDOWN_IMAGES} from "~/utils/markdown";

/**
 * An image in `MarkdownText`: a data URL draws; a remote one is a button until one is clicked, which loads them all
 * (nothing is asked of their hosts before); a relative one draws from `assetUrl` (`/x` and `//host/x` too, as paths in
 * it), or is its alt text without one.
 */
const props = defineProps<{ src?: string, alt?: string }>()
const {t} = useI18n()
const images = inject(MARKDOWN_IMAGES)!

const src = computed(() => props.src ?? '')
const remote = computed(() => /^https?:/i.test(src.value))
const url = computed(() => {
    if (/^data:image\//i.test(src.value) || (remote.value && images.remote.value)) return src.value
    if (remote.value) return undefined
    const path = src.value.replace(/^\/+/, '')
    try {
        return images.asset(decodeURI(path))
    } catch {
        return images.asset(path)
    }
})
const host = computed(() => (URL.canParse(src.value) ? new URL(src.value).host : src.value))
</script>

<template>
    <img v-if="url" :src="url" :alt class="inline max-w-full rounded" referrerpolicy="no-referrer">
    <button
        v-else-if="remote"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-dashed border-default px-2 py-1 text-xs text-muted hover:text-default"
        :title="src"
        data-markdown-load-images
        @click="images.remote.value = true"
    >
        <UIcon name="i-lucide-image" class="size-4"/>
        {{ alt || host }} · {{ t('app.markdown.loadImages') }}
    </button>
    <span v-else>{{ alt }}</span>
</template>
