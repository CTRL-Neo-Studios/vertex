/**
 * The props and events of the components `/ui` publishes (`app/plugin/ui.ts`), by the names it exports them under:
 * `<Name>Props`, and `<Name>Emits` for one that emits. Each component declares its props with these, so they can't
 * drift; the SDK's build types each export from them, so `vue-tsc` checks what a plugin passes.
 */
import type {InternalLinkClickDetail} from '@type32/codemirror-rich-obsidian-editor'
import type {UiSlot} from './contributions'

/**
 * One setting: label and description on the left, its control (the default slot) on the right. `stacked`: the control
 * below them, at the section's full width (an editor, a grid, a list). A stacked row without a `label` is its content
 * alone, padded as every row is (a notice, a preview). Everything in a section is a row, so nothing pads by hand.
 */
export interface SettingsRowProps {
    label?: string
    /** An Iconify name, drawn before the label (a plugin's row). */
    icon?: string
    /** One line: a longer one is cut, with the whole of it as its tooltip. What takes more to say goes in `info`. */
    description?: string
    /** More than a line of explanation (why, what's sent, what it costs), behind an info button beside the label. */
    info?: string
    /** Replaces the description, in the error colour. */
    error?: string
    stacked?: boolean
    /**
     * The setting it edits (`plugins.config.<id>.depth`): it then follows the Settings window's scope (Global only,
     * Changed in this workspace, Use global).
     */
    setting?: string
}

/** A group of `SettingsRow`s under a title, with `actions` beside it. */
export interface SettingsSectionProps {
    title: string
    /** One line, as a row's. */
    description?: string
    /** As a row's: behind an info button beside the title. */
    info?: string
    /** What to say while the section has no rows ("No tokens saved."). */
    empty?: string
    /** Shows the reset button, which emits `reset`; what "dirty" means is the caller's. */
    dirty?: boolean
}

export interface SettingsSectionEmits {
    reset: []
}

/**
 * Something done to the rows a `SettingsList` has selected (Remove, Revoke, Turn off). Its button shows while it
 * applies to one of them, with how many.
 */
export interface SettingsListAction<T extends { id: string } = { id: string }> {
    id: string
    /** The button's text for `count` rows ("Remove (3)"), already translated. */
    label(count: number): string
    icon?: string
    color?: 'neutral' | 'primary' | 'warning' | 'error'
    /** Asked before it runs (a native dialog, with the button's text as OK); none: it runs at once. */
    confirm?(count: number): string
    /** Which of the selected rows it acts on; default all of them. */
    applies?(item: T): boolean
    run(items: T[]): unknown
}

/** One of a `SettingsList`'s filters beside its search (All, On, Off): `test` keeps a row; none keeps all. */
export interface SettingsListFilter<T extends { id: string } = { id: string }> {
    id: string
    /** Already translated. */
    label: string
    test?(item: T): boolean
}

/**
 * A list in a `SettingsSection`: a search over its rows, and with `actions`, a checkbox per row, one for all the rows
 * shown, and the actions for the selection. Rows are the `row` slot (`{item}`), with the `actions` slot (`{item}`) at
 * their end; `group` puts headings between them, in the items' order. Every part is a `SettingsRow`, so it lines up
 * with the section's other rows. `v-model:query` holds the search (in the URL, so a Back link returns to it);
 * `v-model:filter` the chosen filter's id (default the first).
 */
export interface SettingsListProps<T extends { id: string } = { id: string }> {
    items: readonly T[]
    /** What the search matches, in any case. */
    text(item: T): string
    placeholder?: string
    /** Shown when there are no items at all; "Nothing matches" is the list's own. */
    empty: string
    actions?: readonly SettingsListAction<T>[]
    /** Keeps a row out of the selection (the default profile). */
    selectable?(item: T): boolean
    /** A row's heading, already translated: a heading before the first row of each. */
    group?(item: T): string
    filters?: readonly SettingsListFilter<T>[]
}

/**
 * Markdown from someone else (a plugin's README), drawn with Nuxt UI's prose: no raw HTML, no components or
 * attributes. Links open in the browser (web and mail only; others are text). A relative image draws from
 * `assetUrl`; a remote one waits for a click, which loads them all.
 */
export interface MarkdownProps {
    value: string
    /** A relative image's URL (`ctx.plugin.assetUrl`). None: it's its alt text. */
    assetUrl?(path: string): string
}

/** A settings page: a sticky header with the title (`header-leading`, `header-trailing`) over the scrolling content. */
export interface SettingsScrollLayoutProps {
    title?: string
    /** Read-only while the Settings window edits a workspace: none of the page's settings can be overridden there. */
    globalOnly?: boolean
}

/**
 * A file viewer's frame: the header with the file's name (editable, `v-model:fileName`), the content, the status bar
 * with the registered status items. Slots: `header-left`, `header-right`, the default (with `contentWidthClass`),
 * `status-bar`.
 */
export interface ViewerLayoutProps {
    /** The file's name without its extension; renaming it emits `update:fileName`. */
    fileName?: string
    showHeader?: boolean
    showBreadcrumbs?: boolean
    renaming?: boolean
    filePath?: string
    /** Default `vertical`. */
    scrollMode?: 'vertical' | 'both' | 'none'
    showScrollbar?: boolean
    showStatusBar?: boolean
    /** Default `center`. */
    contentAlignment?: 'center' | 'start' | 'stretch'
    /** A Tailwind class; default `max-w-2xl`. */
    contentMaxWidth?: string
    contentPadding?: boolean
    cursorText?: boolean
    /** Room for the header above the content (default `true`); without it the content runs under the header's fade. */
    topSpacing?: boolean
    bottomSpacing?: boolean
    ui?: { root?: string }
}

export interface ViewerLayoutEmits {
    'update:fileName': [name: string]
    'on-rename': [oldValue: string, newValue: string]
}

/** A Markdown editor inside something else (a card, a form): the note editor's rendering, links and syntax. */
export interface NoteEditorProps {
    text: string
    /** The file it's in, for its links and embeds. */
    notePath: string
}

export interface NoteEditorEmits {
    update: [text: string]
    /** Esc. */
    done: []
    /** An internal link's click, for the caller to follow. */
    openLink: [detail: InternalLinkClickDetail]
}

/** Draws a contribution's UI (`component` or `mount`) with `props`, inside an error boundary that names its plugin. */
export interface PluginMountProps {
    ui: UiSlot<never>
    props: object
}

/** The vault picker: files or folders of the workspace (`v-model`: workspace-relative paths). */
export interface VaultPickerProps {
    modelValue?: string[]
    sessionId: string
    /** Default `any`. */
    kind?: 'file' | 'folder' | 'any'
    multiple?: boolean
    /** Comma-separated, without dots (`png,jpg`). */
    extensions?: string
}

export interface VaultPickerEmits {
    'update:modelValue': [paths: string[]]
}

/** Two versions of a text, line by line; `header` gets the +/− counts. `sides` missing: still loading. */
export interface TextDiffProps {
    sides?: { before?: string, after?: string }
    failed?: boolean
}
