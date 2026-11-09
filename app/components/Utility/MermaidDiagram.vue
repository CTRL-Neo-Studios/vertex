<script setup lang="ts">
import {mount, type Mounted, type MountOptions} from "pele";
import {useAppOpener} from "~/composables/app/useAppOpener";

const props = defineProps<{ source: string, options?: MountOptions }>()
const el = useTemplateRef<HTMLDivElement>('el')
const {openUrlInBrowser} = useAppOpener()
let diagram: Mounted | undefined

onMounted(() => diagram = mount(el.value!, props.source, props.options))
watch(() => props.source, source => diagram?.update(source))
onBeforeUnmount(() => diagram?.destroy())

// An <a> in the SVG would navigate the Tauri window away from the app; send URL links to the browser instead.
// ponytail: internal (note-name) links are swallowed, wire them to workspace navigation when wanted.
function onClick(event: MouseEvent) {
    const link = (event.target as Element).closest('a')
    if (!link) return
    event.preventDefault()
    const href = link.getAttribute('href')
    if (href && !link.classList.contains('internal-link')) openUrlInBrowser(href)
}
</script>

<template>
    <div ref="el" class="w-full [&>svg]:mx-auto" @click="onClick"/>
</template>
