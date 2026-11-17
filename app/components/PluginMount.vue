<script setup lang="ts">
import type {Component} from "vue";
import type {ComponentLoader} from "#shared/plugin/api";
import type {PluginMountProps} from "#shared/plugin/components";
import {contributionOwner} from "~/utils/plugins/runtime";

/**
 * Draws a contribution's UI (`UiSlot`): its `component` with `props`, or its `mount` into a `div` (run again, after
 * its disposer, when `props` change). Inside an error boundary: what fails draws the plugin's name and the error in
 * its place instead of taking the window down. Attributes (`class`) go to the component or the `div`.
 */
const props = defineProps<PluginMountProps>()

const {t} = useI18n()
const error = ref<string>()
const owner = computed(() => contributionOwner(props.ui) ?? 'Vertex')
const report = (cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : String(cause)
    console.error(`[plugins] ${owner.value} couldn't draw:`, cause)
}

const component = computed(() => props.ui.component && asyncComponent(props.ui.component))
onErrorCaptured(cause => {
    report(cause)
    return false
})

const el = useTemplateRef<HTMLElement>('el')
let dispose: (() => void) | undefined
function unmount() {
    try {
        dispose?.()
    } catch (cause) {
        report(cause)
    }
    dispose = undefined
}
function mount() {
    unmount()
    if (!el.value || !props.ui.mount) return
    try {
        dispose = (props.ui.mount as (el: HTMLElement, props: object) => (() => void) | undefined)(el.value, props.props)
    } catch (cause) {
        report(cause)
    }
}
onMounted(mount)
watch(() => props.props, mount)
onBeforeUnmount(unmount)
</script>

<script lang="ts">
/** One async component per loader, so redrawing doesn't load it again. */
const loaded = new WeakMap<ComponentLoader, Component>()
function asyncComponent(load: ComponentLoader): Component {
    const known = loaded.get(load)
    if (known) return known
    // Vue unwraps `default` only from real ES modules; a loader may resolve to a plain `{default}` too.
    const component = defineAsyncComponent(async () => {
        const module = await load()
        return 'default' in module ? module.default : module
    })
    loaded.set(load, component)
    return component
}
</script>

<template>
    <div v-if="error" class="p-3">
        <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-puzzle"
            :title="t('app.plugins.drawFailed', {name: owner})"
            :description="error"
        />
    </div>
    <component :is="component" v-else-if="component" v-bind="props.props"/>
    <div v-else-if="ui.mount" ref="el"/>
</template>
