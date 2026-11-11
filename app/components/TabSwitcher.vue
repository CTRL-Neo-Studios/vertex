<script setup lang="ts">
import type {ActiveSession} from "#shared/types/active/sessions";
import {platform} from "@tauri-apps/plugin-os";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useTabLabel} from "~/composables/active/useTabLabel";
import {useAppNavigator} from "~/composables/app/useAppNavigator";

/**
 * Ctrl+Tab through the window's tabs, as the OS app switchers do. The tabs come in most-recently-shown order, so a
 * quick Ctrl+Tab goes back to the previous tab. Holding Ctrl shows the list after a moment: Tab goes on, ` (the key
 * left of 1, as in macOS's Cmd+Tab) or Shift+Tab goes back, and releasing Ctrl (or Enter, or a click) goes to the
 * highlighted tab; Esc or leaving the window stays put. No arrow keys: macOS keeps Ctrl+arrows for Mission Control and
 * Spaces. Cmd/Ctrl+Shift+] and [ go to the next or previous tab in the tab bar, with no list. The keys are caught
 * before the page, so the editor never indents and the prompt never gets a tab.
 */
const props = defineProps<{ session: ActiveSession }>()
const {tabs, activeTabUuid, openTab} = useActiveTabs(props.session)
const labelOf = useTabLabel(props.session)
const $navi = useAppNavigator()
const mac = platform() === 'macos'
/** How long Ctrl+Tab is held before the list shows; a quicker press just switches. */
const SHOW_AFTER = 200

// The shown tab moves to the front; closed tabs drop out when a switch starts.
const recent = ref<string[]>([])
watch(activeTabUuid, id => {
    if (id) recent.value = [id, ...recent.value.filter(r => r !== id)]
}, {immediate: true})

/** The tabs as this switch began (frozen while it lasts), and the highlighted one; -1 when not switching. */
const order = ref<string[]>([])
const at = ref(-1)
const shown = ref(false)
let showTimer: ReturnType<typeof setTimeout> | undefined

const rows = computed(() => order.value.flatMap(id => {
    const tab = tabs.value.find(t => t.fileUuid === id)
    const label = tab && labelOf(tab)
    return label ? [{id, ...label}] : []
}))

function go(id: string | undefined) {
    if (!id || id === activeTabUuid.value || !tabs.value.some(t => t.fileUuid === id)) return
    void $navi.toWorkspaceTab(props.session.uuid, openTab(id))
}

function stop() {
    clearTimeout(showTimer)
    at.value = -1
    shown.value = false
}

function finish() {
    const id = rows.value[at.value]?.id
    stop()
    go(id)
}

function step(by: number) {
    const count = rows.value.length
    at.value = (at.value + by + count) % count
}

function onKeydown(event: KeyboardEvent) {
    const swallow = () => {
        event.preventDefault()
        event.stopPropagation()
    }
    // ` by its physical key (`code`): its character differs by layout.
    const back = event.code === 'Backquote'
    if ((event.key === 'Tab' || back) && event.ctrlKey && !event.metaKey && !event.altKey) {
        swallow()
        if (at.value === -1) {
            const open = tabs.value.map(t => t.fileUuid), seen = recent.value.filter(id => open.includes(id))
            order.value = [...seen, ...open.filter(id => !seen.includes(id))]
            if (rows.value.length < 2) return
            at.value = 0
            showTimer = setTimeout(() => shown.value = true, SHOW_AFTER)
        } else shown.value = true
        step(back !== event.shiftKey ? -1 : 1)
        return
    }
    if (at.value !== -1) {
        if (event.key === 'Enter') {
            swallow()
            finish()
        } else if (event.key === 'Escape') {
            swallow()
            stop()
        }
        return
    }
    // By the physical key: with Shift held, `key` is `}` or `{` (and differs by layout).
    if ((mac ? event.metaKey : event.ctrlKey) && event.shiftKey && (event.code === 'BracketRight' || event.code === 'BracketLeft')) {
        swallow()
        const ids = tabs.value.map(t => t.fileUuid), i = ids.indexOf(activeTabUuid.value ?? '')
        if (ids.length > 1) go(ids[(i + (event.code === 'BracketRight' ? 1 : -1) + ids.length) % ids.length])
    }
}

useEventListener(window, 'keydown', onKeydown, {capture: true})
useEventListener(window, 'keyup', (event: KeyboardEvent) => {
    if (event.key === 'Control' && at.value !== -1) finish()
}, {capture: true})
useEventListener(window, 'blur', stop)

const listRef = useTemplateRef<HTMLElement>('listRef')
watch([at, shown], async () => {
    await nextTick()
    listRef.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({block: 'nearest'})
})
</script>

<template>
    <Teleport to="body">
        <!-- The window behind the list is lightly blurred and dimmed while switching. -->
        <Transition enter-active-class="transition duration-150" leave-active-class="transition duration-100" enter-from-class="opacity-0" leave-to-class="opacity-0">
        <div v-if="shown" data-tab-switcher class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-default/20 backdrop-blur-xs">
            <div
                ref="listRef"
                role="listbox"
                :aria-label="$t('app.editor.ui.tabSwitcher')"
                class="pointer-events-auto w-96 max-w-[90vw] max-h-[60vh] overflow-y-auto rounded-lg border border-default bg-default p-1 shadow-lg"
            >
                <div
                    v-for="(row, index) in rows"
                    :key="row.id"
                    role="option"
                    :aria-selected="index === at"
                    :class="['flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm cursor-default select-none', index === at ? 'bg-elevated text-highlighted' : 'text-default']"
                    @mousemove="at = index"
                    @mousedown.prevent="finish"
                >
                    <UIcon :name="row.icon" class="size-4 shrink-0"/>
                    <span class="truncate">{{ row.label }}</span>
                    <span v-if="row.folder" class="ms-auto truncate text-xs text-dimmed">{{ row.folder }}</span>
                </div>
            </div>
        </div>
        </Transition>
    </Teleport>
</template>
