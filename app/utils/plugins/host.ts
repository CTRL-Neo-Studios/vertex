import {effectScope, getCurrentScope, onScopeDispose, shallowReactive, type EffectScope} from 'vue'
import type {ContributionPoints, HostServices, PluginApis, PluginConfigAccess, PluginContext, PluginDefinition, PluginEntry, SessionContext} from '#shared/plugin/api'
import {parseRequirement, pluginWindows, type PluginManifest, type WindowKind} from '#shared/plugin/manifest'
import {resolvePlugins, type OffReason} from '#shared/plugin/resolve'
import {pluginWindows as ownWindows} from '~/utils/plugins/windows'

export type PluginState =
    | { status: 'off', reason: OffReason }
    | { status: 'starting' }
    | { status: 'active' }
    | { status: 'failed', error: string }

export interface PluginHostOptions {
    /** `plugin`: one of a plugin's own windows, where the entries given are that plugin alone. */
    window: { kind: WindowKind | 'plugin', label: string }
    /** Adds a contribution (a command's id already `<plugin>:<id>`) on behalf of plugin `owner`; returns its removal. */
    contribute<P extends keyof ContributionPoints>(point: P, owner: string, def: ContributionPoints[P]): () => void
    /** A plugin's `ctx.config`: its settings in this window. */
    config(manifest: PluginManifest): PluginConfigAccess<Record<string, unknown>>
    /** A plugin's `ctx.http`, `ctx.secrets`, `ctx.data`, `ctx.dialogs` and `ctx.notifications`; `own` ties a listener to the current scope like a registration. */
    services(manifest: PluginManifest, own: (dispose: () => void) => void): HostServices
    /** `ctx.settings.open`: the Settings window at `/settings/<path>`, on this window's scope. */
    openSettings(path: string): Promise<void>
    /** `ctx.plugin.assetUrl`: a URL for a file of an installed plugin's folder. */
    assetUrl(id: string, path: string): string
    /** A plugin failed to load or start, or one of its callbacks threw. */
    onFailed(manifest: PluginManifest, error: unknown): void
}

interface Running {
    entry: PluginEntry
    scope: EffectScope
    api?: object
    hooks: ((session: SessionContext) => unknown)[]
    /** Child of `scope`, for what `onSession` callbacks start; stopped when the session ends. */
    sessionScope?: EffectScope
}

interface Waiter {
    owner: Running
    fn: (api: object) => void
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
const isThenable = (value: unknown): value is PromiseLike<unknown> =>
    !!value && typeof (value as PromiseLike<unknown>).then === 'function'

export type PluginHost = ReturnType<typeof createPluginHost>

/**
 * One window's plugins: which run, starting them in order, their scopes, their session callbacks and their APIs.
 * `setEntries` replaces the plugins it knows (one installed or removed); a running one stays until the app restarts.
 */
export function createPluginHost(initial: readonly PluginEntry[], options: PluginHostOptions) {
    /** Every plugin made for this window, by id; reactive, for Settings → Plugins. */
    const states = shallowReactive(new Map<string, PluginState>())
    let byId = new Map<string, PluginEntry>()
    let installed = new Set<string>()
    let forWindow: PluginEntry[] = []
    function setEntries(entries: readonly PluginEntry[]) {
        byId = new Map([...[...running.values()].map(r => [r.entry.manifest.id, r.entry] as const), ...entries.map(e => [e.manifest.id, e] as const)])
        installed = new Set(entries.map(e => e.manifest.id))
        forWindow = options.window.kind === 'plugin' ? [...entries] : entries.filter(e => pluginWindows(e.manifest).includes(options.window.kind as WindowKind))
        for (const id of states.keys()) if (!byId.has(id)) states.delete(id)
    }
    const running = new Map<string, Running>()
    /** Failed while on: not retried until it's turned off and on again. */
    const failed = new Set<string>()
    const waiting = new Map<string, Waiter[]>()
    let session: SessionContext | undefined
    setEntries(initial)

    function fail(id: string, error: unknown) {
        running.get(id)?.scope.stop()
        running.delete(id)
        failed.add(id)
        states.set(id, {status: 'failed', error: messageOf(error)})
        options.onFailed(byId.get(id)!.manifest, error)
    }

    /** Runs `fn` in one of the plugin's scopes; a throw or a rejected promise fails the plugin. */
    function guarded(r: Running, scope: EffectScope, fn: () => unknown) {
        const id = r.entry.manifest.id
        try {
            const result = scope.run(fn)
            if (isThenable(result)) result.then(undefined, error => fail(id, error))
        } catch (error) {
            fail(id, error)
        }
    }

    function runHooks(r: Running) {
        r.sessionScope = r.scope.run(() => effectScope())!
        for (const hook of [...r.hooks]) {
            if (!running.has(r.entry.manifest.id)) return
            guarded(r, r.sessionScope, () => hook(session!))
        }
    }

    function context(r: Running): PluginContext {
        const {manifest, source} = r.entry
        const id = manifest.id
        /**
         * Ties a removal to the scope that's current when something is registered: the plugin's in `setup`, the
         * session's in an `onSession` callback, a component's in its setup. Outside any, to the plugin's.
         */
        const own = (dispose: () => void) => {
            if (getCurrentScope()) onScopeDispose(dispose)
            else if (r.scope.active) r.scope.run(() => onScopeDispose(dispose))
        }
        /** Registers `def` at `point` for this plugin; the removal belongs to the current scope (see `own`) and runs once. */
        const add = <P extends keyof ContributionPoints>(point: P, def: ContributionPoints[P]) => {
            const remove = options.contribute(point, id, def)
            let removed = false
            const once = () => {
                if (removed) return
                removed = true
                remove()
            }
            own(once)
            return once
        }
        const use = <K extends keyof PluginApis>(target: K) =>
            (states.get(target as string)?.status === 'active' ? running.get(target as string)?.api : undefined) as PluginApis[K] | undefined

        return {
            plugin: {id, name: manifest.name, version: manifest.version, source, assetUrl: path => options.assetUrl(id, path)},
            config: options.config(manifest),
            ...options.services(manifest, own),
            window: {...options.window},
            commands: {
                register: command => add('command', {...command, id: `${id}:${command.id}`, plugin: id}),
                paletteGroup: def => add('paletteGroup', def),
            },
            views: {
                panel: def => add('panel', def),
                tabKind: def => add('tabKind', def),
                fileViewer: def => add('viewer', def),
                statusItem: def => add('statusItem', def),
                overlay: def => add('overlay', def),
                paneRule: def => {
                    if (source !== 'core') throw new Error('ctx.views.paneRule is for Vertex\'s own plugins')
                    return add('paneRule', def)
                },
            },
            files: {
                type: def => add('fileType', def),
                menuItem: def => add('fileMenuItem', def),
            },
            settings: {page: def => add('settingsPage', def), open: path => options.openSettings(path)},
            home: {action: def => add('homeAction', def)},
            editor: {
                extension: (extension, options) => add('editorExtension', {extension, nested: options?.nested}),
                codeBlock: def => add('codeBlock', def),
                embed: def => add('embed', def),
                markdown: syntax => add('markdownSyntax', syntax),
                slashItem: def => add('slashItem', def),
                toolbarItem: def => add('toolbarItem', def),
                noteMenuItem: def => add('noteMenuItem', def),
            },
            index: {linkExtractor: def => add('linkExtractor', def)},
            windows: {
                define: def => add('pluginWindow', {...def, plugin: id}),
                ...ownWindows(id, own),
            },
            onSession(fn) {
                r.hooks.push(fn)
                // During `setup` the host runs it once `setup` is done; later, now.
                if (session && r.sessionScope) guarded(r, r.sessionScope, () => fn(session!))
            },
            provide(api) {
                r.api = api
            },
            use,
            whenPlugin(target, fn) {
                const api = use(target)
                if (api) return fn(api)
                const waiter: Waiter = {owner: r, fn: fn as (api: object) => void}
                waiting.set(target, [...waiting.get(target) ?? [], waiter])
                own(() => waiting.set(target, (waiting.get(target) ?? []).filter(w => w !== waiter)))
            },
        }
    }

    function start(entry: PluginEntry, definition: PluginDefinition) {
        const id = entry.manifest.id
        for (const {id: requirement, optional} of (entry.manifest.requires ?? []).map(parseRequirement)) {
            // In its own window a plugin runs alone: what it requires isn't there, and its `use` finds nothing.
            if (optional || options.window.kind === 'plugin' || states.get(requirement)?.status === 'active') continue
            states.set(id, {status: 'off', reason: {kind: 'requirementFailed', requirement}})
            return
        }
        const r: Running = {entry, scope: effectScope(true), hooks: []}
        running.set(id, r)
        try {
            const result = r.scope.run(() => definition.setup(context(r)))
            if (isThenable(result)) {
                result.then(undefined, () => {})
                throw new Error('setup must be synchronous, but it returned a promise')
            }
        } catch (error) {
            fail(id, error)
            return
        }
        states.set(id, {status: 'active'})
        if (r.api) {
            const waiters = waiting.get(id) ?? []
            waiting.delete(id)
            for (const w of waiters) if (running.get(w.owner.entry.manifest.id) === w.owner) guarded(w.owner, w.owner.scope, () => w.fn(r.api!))
        }
        if (session) runHooks(r)
    }

    async function applyNow(isOn: (manifest: PluginManifest) => boolean) {
        // In its own window a plugin runs alone, whatever it requires.
        const manifests = forWindow.map(e => (options.window.kind === 'plugin' ? {...e.manifest, requires: []} : e.manifest))
        const {order, off} = resolvePlugins(manifests, isOn, installed)
        // A running plugin turned off runs on until the app restarts: Rust can't take its window's grants back before
        // then, and nothing guarantees a plugin can undo itself.
        for (const [id, reason] of off) {
            if (running.has(id)) continue
            failed.delete(id)
            states.set(id, {status: 'off', reason})
        }
        const toStart = order.filter(id => !running.has(id) && !failed.has(id))
        for (const id of toStart) states.set(id, {status: 'starting'})
        // Fetched together, started in order.
        const loaded = await Promise.all(toStart.map(id => byId.get(id)!.load().then(
            module => ({id, definition: module?.default as PluginDefinition | undefined, error: undefined as unknown}),
            (error: unknown) => ({id, definition: undefined, error}),
        )))
        for (const {id, definition, error} of loaded) {
            if (!definition || typeof definition.setup !== 'function') {
                fail(id, error ?? new Error('its entry has no default export from definePlugin'))
                continue
            }
            start(byId.get(id)!, definition)
        }
    }

    let queue: Promise<void> = Promise.resolve()

    return {
        states,
        /** The plugins this window knows: the core ones and the installed ones, after an install or a removal. */
        setEntries,
        /** Starts what's newly on, in order; what's turned off runs on until the app restarts. Serialized. */
        apply(isOn: (manifest: PluginManifest) => boolean) {
            queue = queue.then(() => applyNow(isOn))
            return queue
        },
        /** The window's session is ready: run every `onSession` callback, in start order. */
        startSession(context: SessionContext) {
            session = context
            for (const r of [...running.values()]) runHooks(r)
        },
        /** Stops what the callbacks started; their registrations go with it. */
        endSession() {
            for (const r of running.values()) {
                r.sessionScope?.stop()
                r.sessionScope = undefined
            }
            session = undefined
        },
        /** Stops every plugin (tests; a window never needs it, the app restarts instead). */
        stop() {
            for (const r of running.values()) r.scope.stop()
            running.clear()
        },
    }
}
