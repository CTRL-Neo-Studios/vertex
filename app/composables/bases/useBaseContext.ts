import type {ComputedRef, InjectionKey, Ref, ShallowRef} from "vue";
import type {ActiveSession} from "#shared/types/active/sessions";
import {fromFrontmatter, propertyKind, runQuery, type Base, type BaseHost, type BaseView, type PropertyKind, type QueryResult, type Value} from "@type32/obsidian-bases-parser";

/** A property a menu can offer: `file.name`, `formula.x`, or a note property by its bare name (`status`). */
export interface BaseProperty {
    id: string
    source: 'file' | 'formula' | 'note'
    /** Its display name (`displayName`), or its own name ("file name" for `file.name`). */
    label: string
    kind: PropertyKind
    icon: string
}

/** What the viewer shares with its toolbar, menus and layouts (`provide`d by `BasesViewer`). */
export interface BaseContext {
    base: ShallowRef<Base>
    /** The tab's view (its name lives in the tab, never in the file). */
    viewName: Ref<string>
    view: ComputedRef<BaseView>
    /** Applies an edit (the library's `edit` functions); the tab saves the file. */
    commit: (next: Base) => void
    search: Ref<string>
    /**
     * The toolbar menu that's open (one at a time): `views`, `addView` (the views menu on a new view's form),
     * `results`, `sort`, `group`, `filter`, `properties`, `new`. Commands open them through it.
     */
    open: Ref<string | null>
    /** A property whose page the Properties menu opens on (with `open` set to `properties`): "Edit property…". */
    propertyPage: Ref<string | null>
    /** A property and value New writes last (a kanban column's, a map point's), read once when New next creates a note. */
    newItemPreset: Ref<{ key: string, value: unknown } | null>
    result: ComputedRef<QueryResult>
    /** Every property a menu offers: file properties, formulas, then the workspace's note properties. */
    properties: ComputedRef<BaseProperty[]>
    /** Any id (`note.x`, `x`, `file.x`, `formula.x`). */
    property: (id: string) => BaseProperty
    host: BaseHost
    /** Every file the query runs over (workspace-relative paths). */
    paths: ComputedRef<string[]>
    /** Workspace-relative path of the base (`this`). */
    thisPath: string
    session: ActiveSession
}

export const BASE_CONTEXT: InjectionKey<BaseContext> = Symbol('bases')

export function useBaseContext(): BaseContext {
    const context = inject(BASE_CONTEXT)
    if (!context) throw new Error('useBaseContext() outside a BasesViewer')
    return context
}

/** In the order Obsidian's property pickers list them. */
export const FILE_PROPERTIES = ['name', 'basename', 'fullname', 'path', 'folder', 'ext', 'ctime', 'mtime', 'size', 'links', 'embeds', 'tags', 'backlinks'] as const

/** `note.x` → `x`; other ids as they are. */
export const bareId = (id: string) => (id.startsWith('note.') ? id.slice(5) : id)
/** `x` → `note.x` (how `properties` and `columnSize` key note properties); other ids as they are. */
export const fullId = (id: string) => (/^(note|file|formula)\./.test(id) ? id : `note.${id}`)

const KIND_ICONS: Record<PropertyKind, string> = {
    text: 'i-lucide-text', number: 'i-lucide-binary', checkbox: 'i-lucide-square-check', date: 'i-lucide-calendar',
    list: 'i-lucide-list', file: 'i-lucide-file',
}

/** A value's property kind, as Obsidian infers a property type from its values; null for an empty value. */
function kindOfValue(value: Value): PropertyKind | null {
    switch (value.type) {
        case 'Null': return null
        case 'Boolean': return 'checkbox'
        case 'Number': return 'number'
        case 'Date': return 'date'
        case 'List': return 'list'
        default: return 'text'
    }
}

/**
 * The viewer's shared state. `base` is the parsed file, replaced by `commit`; the query re-runs when it, the view,
 * the search or the workspace changes.
 */
export function createBaseContext(options: {
    base: ShallowRef<Base>
    commit: (next: Base) => void
    host: BaseHost
    paths: ComputedRef<string[]>
    thisPath: string
    session: ActiveSession
}): BaseContext {
    const {base, host, paths, thisPath, session} = options
    const {t} = useI18n()
    const viewName = ref('')
    const view = computed(() => base.value.views?.find(v => v.name === viewName.value) ?? base.value.views?.[0] ?? {type: 'table', name: ''})
    const search = ref('')
    const open = ref<string | null>(null)
    const propertyPage = ref<string | null>(null)
    const newItemPreset = ref<{ key: string, value: unknown } | null>(null)
    const searchTerm = refDebounced(search, 200)
    const result = computed(() => runQuery(base.value, view.value.name, {host, paths: paths.value, now: Date.now(), thisPath, search: searchTerm.value}))

    // Note properties across the workspace with the kind of their first value, as Obsidian infers types without
    // `types.json`. Formulas take theirs from the view's rows.
    const noteKinds = computed(() => {
        const kinds = new Map<string, PropertyKind | null>()
        for (const path of paths.value) {
            const frontmatter = host.file(path)?.frontmatter
            if (!frontmatter) continue
            for (const [key, raw] of Object.entries(frontmatter)) {
                if (kinds.get(key)) continue
                kinds.set(key, kindOfValue(fromFrontmatter(raw, path, key)))
            }
        }
        return kinds
    })
    const formulaKinds = computed(() => {
        const kinds = new Map<string, PropertyKind>()
        for (const name of Object.keys(base.value.formulas ?? {})) {
            const id = `formula.${name}`
            let kind: PropertyKind | null = null
            for (const row of result.value.rows) {
                kind = kindOfValue(row.property(id))
                if (kind) break
            }
            kinds.set(id, kind ?? 'text')
        }
        return kinds
    })

    function property(id: string): BaseProperty {
        const bare = bareId(id)
        const displayName = base.value.properties?.[fullId(bare)]?.displayName ?? base.value.properties?.[bare]?.displayName
        if (bare === 'file' || bare.startsWith('file.')) {
            const field = bare === 'file' ? 'file' : bare.slice(5)
            const own = t(`app.editor.ui.bases.fileProperties.${field}`)
            return {id: bare, source: 'file', label: typeof displayName === 'string' ? displayName : own, kind: propertyKind(bare, () => 'text'), icon: 'i-lucide-info'}
        }
        if (bare.startsWith('formula.')) {
            return {id: bare, source: 'formula', label: typeof displayName === 'string' ? displayName : bare.slice(8), kind: formulaKinds.value.get(bare) ?? 'text', icon: 'i-lucide-square-function'}
        }
        const kind = noteKinds.value.get(bare) ?? 'text'
        return {id: bare, source: 'note', label: typeof displayName === 'string' ? displayName : bare, kind, icon: bare === 'tags' ? 'i-lucide-tags' : KIND_ICONS[kind]}
    }

    const properties = computed(() => [
        ...FILE_PROPERTIES.map(f => property(`file.${f}`)),
        ...Object.keys(base.value.formulas ?? {}).map(name => property(`formula.${name}`)),
        ...[...noteKinds.value.keys()].sort((a, b) => a.localeCompare(b)).map(property),
    ])

    return {base, viewName, view, commit: options.commit, search, open, propertyPage, newItemPreset, result, properties, property, host, paths, thisPath, session}
}
