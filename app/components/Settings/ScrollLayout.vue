<script lang="ts">
import type {InjectionKey, ShallowRef} from "vue";
import type {SettingsScrollLayoutProps} from "#shared/plugin/components";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

/** What an outer layout gives one inside it: where its header slots go (`id`), and the title it shows instead. */
const SCROLL_LAYOUT_HOST: InjectionKey<{ id: string, title: ShallowRef<{ owner: symbol, text: string | undefined } | undefined> }> = Symbol('settings-scroll-layout')
</script>

<script setup lang="ts">
/**
 * A settings page: a sticky header (the title, `header-leading`, `header-trailing`) over the scrolling content. Inside
 * another one (a plugin's page, which Settings lays out: its schema, then what the plugin registered), it draws its
 * content only: its title replaces the host's while it's shown, its header slots go into the host's header. A
 * `globalOnly` page is read-only while the Settings window edits a workspace: none of its settings can be overridden
 * there. Published to plugins.
 */
const props = defineProps<SettingsScrollLayoutProps>()
const {t} = useI18n()
const scope = useSettingsScope()
const locked = computed(() => props.globalOnly && scope.root.value !== null)

const host = inject(SCROLL_LAYOUT_HOST, null)
const id = useId()
const nestedTitle = shallowRef<{ owner: symbol, text: string | undefined }>()
if (host) {
    const owner = Symbol('title')
    watchEffect(() => (host.title.value = {owner, text: props.title}))
    onBeforeUnmount(() => {
        if (host.title.value?.owner === owner) host.title.value = undefined
    })
} else {
    provide(SCROLL_LAYOUT_HOST, {id, title: nestedTitle})
}
const shownTitle = computed(() => nestedTitle.value?.text ?? props.title ?? t('app.settings.title'))
</script>

<template>
    <template v-if="host">
        <Teleport defer :to="`[data-settings-header='${host.id}-leading']`"><slot name="header-leading"/></Teleport>
        <Teleport defer :to="`[data-settings-header='${host.id}-trailing']`"><slot name="header-trailing"/></Teleport>
        <UAlert
            v-if="locked"
            class="mb-4"
            color="neutral"
            variant="subtle"
            icon="i-lucide-globe"
            :title="$t('app.settings.scope.globalOnlyPage')"
            :actions="[{label: $t('app.settings.scope.editUser'), color: 'neutral', variant: 'outline', onClick: () => scope.open(null)}]"
        />
        <fieldset class="min-w-0" :disabled="locked" :class="locked && 'opacity-60'">
            <slot/>
        </fieldset>
    </template>
    <div v-else class="relative w-full h-screen overflow-hidden">
        <!-- Header over the content, which fades out under it as a note does under its header. -->
        <div class="absolute inset-x-0 top-0 z-10 bg-linear-to-b from-default from-60% to-transparent" data-tauri-drag-region>
            <div class="px-6 pt-4 pb-6" data-tauri-drag-region>
                <div class="flex items-center justify-between gap-2" data-tauri-drag-region>
                    <div class="flex items-center gap-1 min-w-0" data-tauri-drag-region>
                        <span class="contents" :data-settings-header="`${id}-leading`"/>
                        <slot name="header-leading"/>
                        <h1 class="font-semibold select-none truncate">{{ shownTitle }}</h1>
                    </div>
                    <div class="flex items-center gap-2 h-8">
                        <span class="contents" :data-settings-header="`${id}-trailing`"/>
                        <slot name="header-trailing"/>
                    </div>
                </div>
            </div>
        </div>

        <!-- Scrollable content: under the header, with room at the bottom. -->
        <UScrollArea class="h-full w-full" orientation="vertical">
            <div class="px-6 pt-18 pb-24">
                <UAlert
                    v-if="locked"
                    class="mb-4"
                    color="neutral"
                    variant="subtle"
                    icon="i-lucide-globe"
                    :title="$t('app.settings.scope.globalOnlyPage')"
                    :actions="[{label: $t('app.settings.scope.editUser'), color: 'neutral', variant: 'outline', onClick: () => scope.open(null)}]"
                />
                <!-- `min-w-0`: a fieldset is as wide as its content at least, and a row's one-line description doesn't wrap. -->
                <fieldset class="min-w-0" :disabled="locked" :class="locked && 'opacity-60'">
                    <slot/>
                </fieldset>
            </div>
        </UScrollArea>
    </div>
</template>
