<script setup lang="ts">
import {fileNameFromPath, getFileExtensionFromPath, isImage} from "#shared/plugin/files";
import {chatSession} from "../plugin";
import {useChats} from "../lib/chats";

/**
 * A note, image or folder attached to the prompt or a sent message (`path`, a folder's ending in `/`), as Nuxt UI's
 * ChatAttachment: an image as its thumbnail (from disk; `size` sets how big), a note or folder as a card with its path.
 */
const props = withDefaults(defineProps<{ path: string, removable?: boolean, size?: 'sm' | 'lg' }>(), {size: 'sm'})
defineEmits<{ remove: [] }>()

const session = chatSession()!
const {root} = useChats(session)
const folder = computed(() => props.path.endsWith('/'))
const bare = computed(() => folder.value ? props.path.slice(0, -1) : props.path)
const ext = computed(() => folder.value ? '' : getFileExtensionFromPath(props.path).toLowerCase())
const image = computed(() => !folder.value && isImage(ext.value) && !!root.value)
</script>

<template>
	<UChatAttachment
		:name="folder ? bare.split('/').at(-1) : fileNameFromPath(path, !image)"
		:type="image ? `image/${ext}` : undefined"
		:url="image ? session.files.assetUrl(`${root}/${path}`) : undefined"
		:description="bare.includes('/') ? bare : undefined"
		:icon="folder ? 'i-lucide-folder' : 'i-lucide-file-text'"
		:variant="image ? 'thumbnail' : 'card'"
		:size="image ? size : 'sm'"
		:removable
		:title="bare"
		@remove="$emit('remove')"
	/>
</template>
