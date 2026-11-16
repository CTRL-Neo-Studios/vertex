import type {Component, ComputedRef, ShallowRef} from 'vue'
import type {Base, BaseHost, BaseView, PropertyKind, QueryResult} from '@type32/obsidian-bases-parser'
import type {SessionContext, UiSlot} from '#shared/plugin/api'

/** A property a menu can offer: `file.name`, `formula.x`, or a note property by its bare name (`status`). */
export interface BaseProperty {
    id: string
    source: 'file' | 'formula' | 'note'
    /** Its display name (`displayName`), or its own name ("file name" for `file.name`). */
    label: string
    kind: PropertyKind
    icon: string
}

/** What a base's views draw from: the base, the shown view, its rows, and how to change them. */
export interface BaseViewContext {
    /** The parsed file; `commit` replaces it with an edited one (the parser's `edit` functions, `setViewOption`). */
    base: ShallowRef<Base>
    commit(next: Base): void
    /** The view shown, with its options (`view.value.mapHeight`…). */
    view: ComputedRef<BaseView>
    result: ComputedRef<QueryResult>
    /** Any id (`note.x`, `x`, `file.x`, `formula.x`). */
    property(id: string): BaseProperty
    /** The workspace's files as the query reads them (to evaluate a formula: `center`). */
    host: BaseHost
    /** Workspace-relative path of `this`: the base, or the note or canvas embedding it. */
    thisPath: string
    /** Where it's shown: its tab (undefined), a note (`note`: drawn at its content's height) or a canvas card. */
    embed?: 'note' | 'card'
    session: SessionContext
    /** Opens the New item form once the menus that are closing have gone; `preset` is a property New writes last. */
    newItem(preset?: { key: string, value: unknown }): void
}

export interface BaseViewProps {
    context: BaseViewContext
}

/** A field on the views menu's Configure view page; `label` and the options' labels are i18n keys. */
export type BaseViewOption = { key: string, label: string, when?: (view: BaseView) => boolean } & (
    | { kind: 'slider', min: number, max: number, step: number, default: number }
    | { kind: 'select', options: { value: string, label: string }[], default: string }
    | { kind: 'switch', default: boolean }
    | { kind: 'text', default: string }
    /** A property picker, an expression, or one line per entry (a list). */
    | { kind: 'property' | 'formula' | 'lines', default?: undefined }
)

/** A layout a base's view may use: its file's `type`. Drawn by a `component` or `mount` with `BaseViewProps`. */
export interface BaseViewDef extends UiSlot<BaseViewProps> {
    type: string
    /** i18n key. */
    label: string
    icon: string
    options?: BaseViewOption[]
    /** Its box in a note (`![[x.base]]`, ` ```base `); absent: its content's height. */
    embedStyle?(view: BaseView): Record<string, string> | undefined
}

/** What Bases offers other plugins (`ctx.use('bases')`). */
export interface BasesApi {
    /** Adds a layout; removed with the scope it's called in (a plugin's `setup`) or by what it returns. */
    registerView(def: BaseViewDef): () => void
    /** A row's property value drawn as Bases draws it (`row`: a query row, `id`: a property id); inside a view only. */
    Value: Component
}

declare module '#shared/plugin/api' {
    interface PluginApis {
        bases: BasesApi
    }
}
