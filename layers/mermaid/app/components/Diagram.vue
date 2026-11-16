<script setup lang="ts">
import {mount, type Mounted, type MountOptions} from "pele";
import {openUrl} from "@tauri-apps/plugin-opener";

const props = defineProps<{ source: string, options?: MountOptions }>()
const el = useTemplateRef<HTMLDivElement>('el')
let diagram: Mounted | undefined

onMounted(() => diagram = mount(el.value!, props.source, props.options))
watch(() => props.source, source => diagram?.update(source))
onBeforeUnmount(() => diagram?.destroy())

// An <a> in the SVG would navigate the Tauri window away from the app; send web and mail links to the default app
// instead (anything else, a `file:` or an app's scheme, is refused: it'd launch whatever the system maps it to).
// ponytail: internal (note-name) links are swallowed, wire them to workspace navigation when wanted.
function onClick(event: MouseEvent) {
    const link = (event.target as Element).closest('a')
    if (!link) return
    event.preventDefault()
    const href = link.getAttribute('href')?.trim()
    if (href && !link.classList.contains('internal-link') && /^(https?|mailto):/i.test(href)) void openUrl(href)
}
</script>

<template>
    <div ref="el" class="w-full [&>svg]:mx-auto" @click="onClick"/>
</template>

<style>
/* pele's theme, from the app's colors and fonts. */
:root {
    --pele-bg: var(--ui-bg);
    --pele-fg: var(--ui-text);
    --pele-muted: var(--ui-text-muted);
    --pele-line: var(--ui-text-toned);
    --pele-surface: var(--ui-bg-elevated);
    --pele-surface-alt: var(--ui-bg-accented);
    --pele-border: var(--ui-border-accented);
    --pele-accent: var(--ui-primary);
    --pele-critical: var(--ui-error);
    --pele-error: var(--ui-error);
    --pele-font: var(--font-sans);
    --pele-font-mono: var(--font-mono);
}
</style>
