/**
 * The props and events of the components `/ui` publishes (`app/plugin/ui.ts`), by the names it exports them under:
 * `<Name>Props`, and `<Name>Emits` for one that emits. Each component declares its props with these, so they can't
 * drift; the SDK's build types each export from them, so `vue-tsc` checks what a plugin passes.
 */
import type {InternalLinkClickDetail} from '@type32/codemirror-rich-obsidian-editor'
import type {UiSlot} from './contributions'

/** One setting: label and description on the left, its control (the default slot) on the right. */
export interface SettingsRowProps {
    label: string
    description?: string
    /** Replaces the description, in the error colour. */
    error?: string
    /**
     * The setting it edits (`plugins.config.<id>.depth`): it then follows the Settings window's scope (Global only,
     * Changed in this workspace, Use global).
     */
    setting?: string
}

/** A group of `SettingsRow`s under a title, with `actions` beside it. */
export interface SettingsSectionProps {
    title: string
    description?: string
    /** Shows the reset button, which emits `reset`; what "dirty" means is the caller's. */
    dirty?: boolean
}

export interface SettingsSectionEmits {
    reset: []
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
