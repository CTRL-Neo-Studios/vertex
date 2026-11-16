import type {Extension} from "@codemirror/state";
import {h, render, type AppContext} from "vue";
import {nestedExtensions, type EmbedMount, type MarkdownOptions, type SpecialCodeBlockMapping} from "@type32/codemirror-rich-obsidian-editor";
import {editorLabels} from "@type32/codemirror-rich-obsidian-editor/kit";
import {slashItems as slashItemsFacet, toolbarItems as toolbarItemsFacet} from "@type32/codemirror-rich-obsidian-editor/ext";
import type {EditorHost, UiSlot} from "#shared/plugin/api";
import type {ActiveSession} from "#shared/types/active/sessions";
import PluginMount from "~/components/PluginMount.vue";
import {codeBlocks, editorExtensions, markdownSyntax, slashItems, toolbarItems} from "~/utils/contributions";
import {pluginSession} from "~/utils/plugins/runtime";
import {useActiveEditorExtensions} from "~/composables/active/editor/useActiveEditorExtensions";
import {useInternalLinkList} from "~/composables/active/editor/useInternalLinkList";

/**
 * What a note editor (`<Editor>`) draws with, from the kernel's own and what plugins registered (Plugin Architecture
 * Plan, K4): its code blocks, link list (with the embeds), Markdown syntax and extensions. With `tabId` it's a tab's
 * editor: the kernel's extensions (`useActiveEditorExtensions`), every registered one, the slash and toolbar items and
 * their labels. Without, an editor inside something else (a canvas card): only the `nested` extensions, as callouts and
 * table cells get. Each input stays the same object until what it's built from changes, as the editor reconfigures
 * (or reparses) on a new one.
 *
 * Code blocks and embeds draw through `PluginMount` (an error boundary naming the plugin) with `host` added to the
 * editor's props. The editor draws once `ready` (the session is handed to plugins), so `host.session` is always set.
 * Call it in the setup of the component drawing the editor.
 */
export function useNoteEditor(session: ActiveSession | undefined, notePath: MaybeRefOrGetter<string>, tabId?: MaybeRefOrGetter<string>) {
    const {t, locale} = useI18n()
    const host: EditorHost = {
        get session() { return pluginSession()! },
        get notePath() { return toValue(notePath) },
    }
    const ready = computed(() => !!pluginSession())

    // What's mounted gets the editor's own context: the app's, and the provides around it (`<UApp>`'s, which tooltips
    // need), as the editor mounts its own components.
    const instance = getCurrentInstance()!
    // `provides` is on every instance, but not in Vue's public type.
    const withProvides = instance as unknown as { provides: AppContext['provides'] }
    const context: AppContext = {...instance.appContext, provides: withProvides.provides}
    // One function per registration for this editor: the editor redraws a block or an embed whose function changes.
    const mounts = new WeakMap<object, EmbedMount>()
    function mountOf(def: UiSlot<never>): EmbedMount {
        let mount = mounts.get(def)
        if (!mount) mounts.set(def, mount = (el, props) => {
            const vnode = h(PluginMount, {ui: def, props: {...props, host}})
            vnode.appContext = context
            render(vnode, el)
            return () => render(null, el)
        })
        return mount
    }

    const codeBlockMap = computed<SpecialCodeBlockMapping[]>(() => [...codeBlocks.items.values()].map(def => ({codeInfo: def.language, mount: mountOf(def)})))
    const links = useInternalLinkList(session, mountOf)
    const markdown = computed<MarkdownOptions>(() => ({extensions: [...markdownSyntax.items]}))

    const own = tabId === undefined ? undefined : useActiveEditorExtensions(session, tabId)
    // Registered slash and toolbar items are labelled by id, as the kernel's are (`LABEL_KEYS`).
    const actionLabels = computed(() => {
        void locale.value
        const actions = [...slashItems.items.values(), ...toolbarItems.items.values()]
        return editorLabels.of(Object.fromEntries(actions.map(action => [action.id, t(action.label)])))
    })
    const extensions = computed<Extension[]>(() => {
        const registered = [...editorExtensions.items].flatMap(def => {
            if (!own && !def.nested) return []
            const extension = typeof def.extension === 'function' ? def.extension(host) : def.extension
            return def.nested ? [extension, nestedExtensions.of(extension)] : [extension]
        })
        if (!own) return registered
        return [
            ...own.value,
            ...registered,
            actionLabels.value,
            slashItemsFacet.of([...slashItems.items.values()]),
            toolbarItemsFacet.of([...toolbarItems.items.values()]),
        ]
    })

    return {host, ready, codeBlocks: codeBlockMap, links, markdown, extensions}
}
