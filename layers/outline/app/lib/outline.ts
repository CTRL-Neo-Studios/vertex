import {shallowRef, type ShallowRef} from 'vue'
import {useThrottleFn} from '@vueuse/core'
import type {EditorState} from '@codemirror/state'
import {EditorView, ViewPlugin} from '@codemirror/view'
import {headingAt, headingsField, type Heading} from '@type32/codemirror-rich-obsidian-editor/kit'

export interface Outline {
    headings: Heading[]
    /** The `from` of the heading holding the cursor. */
    active: number | null
}

const outlines = new WeakMap<EditorView, ShallowRef<Outline>>()

/** A note editor's outline, which `tracker` keeps while the editor lives. */
export function outlineOf(view: EditorView): ShallowRef<Outline> {
    let outline = outlines.get(view)
    if (!outline) outlines.set(view, outline = shallowRef({headings: [], active: null}))
    return outline
}

/**
 * Keeps each note editor's outline: once when it's created (a view plugin, not an update listener, for that), then at
 * most every 100 ms while it changes. The heading list is a new array on every edit; the shallow ref keeps it unproxied.
 */
export const tracker = [headingsField, ViewPlugin.define((view) => {
    const outline = outlineOf(view)
    const sync = useThrottleFn((state: EditorState) => {
        const headings = state.field(headingsField)
        const active = headingAt(state, state.selection.main.head)?.from ?? null
        if (headings !== outline.value.headings || active !== outline.value.active) outline.value = {headings, active}
    }, 100, true, true)
    void sync(view.state)
    return {update: (u) => { void sync(u.state) }}
})]

/** Puts the cursor on the heading at `from`, scrolled to the top of the editor, and focuses it. */
export function jumpTo(view: EditorView, from: number) {
    view.dispatch({selection: {anchor: from}, effects: EditorView.scrollIntoView(from, {y: 'start', yMargin: 70})})
    view.focus()
}
