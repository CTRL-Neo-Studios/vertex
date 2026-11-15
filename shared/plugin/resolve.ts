import {parseRequirement, type PluginManifest} from './manifest'

/** Why a plugin isn't running in a window. */
export type OffReason =
    | { kind: 'disabled' }
    /** A plugin it requires isn't installed. */
    | { kind: 'missing', requirement: string }
    /** A plugin it requires is installed but not running here: turned off, off itself, or made for other windows. */
    | { kind: 'requirementOff', requirement: string }
    /** It requires itself through others; every plugin of the cycle is off. */
    | { kind: 'cycle', cycle: string[] }
    /** A plugin it requires failed to start. Set by the host, not by `resolvePlugins`. */
    | { kind: 'requirementFailed', requirement: string }

export interface Resolution {
    /** What runs, each after what it requires (and after the optional requirements that run). */
    order: string[]
    off: Map<string, OffReason>
}

/** Whether the user has the plugin on: their choice, else the manifest's default (on). */
export const pluginEnabled = (manifest: PluginManifest, enabled: Readonly<Record<string, boolean>>): boolean =>
    enabled[manifest.id] ?? manifest.enabledByDefault ?? true

const required = (m: PluginManifest) => (m.requires ?? []).map(parseRequirement).filter(r => !r.optional).map(r => r.id)

/**
 * Which of `candidates` (the plugins made for this window) run, in what order. `isOn` is the user's choice; `installed`
 * holds every installed plugin id, so a requirement that exists only for other windows reads as off, not missing.
 */
export function resolvePlugins(
    candidates: readonly PluginManifest[],
    isOn: (manifest: PluginManifest) => boolean,
    installed: ReadonlySet<string>,
): Resolution {
    const byId = new Map(candidates.map(m => [m.id, m]))
    const off = new Map<string, OffReason>()
    for (const m of candidates) if (!isOn(m)) off.set(m.id, {kind: 'disabled'})

    // Cycles over required edges, among the plugins that are on.
    const state = new Map<string, 'visiting' | 'done'>()
    const stack: string[] = []
    const visit = (id: string) => {
        state.set(id, 'visiting')
        stack.push(id)
        for (const next of required(byId.get(id)!)) {
            if (!byId.has(next) || off.has(next)) continue
            if (state.get(next) === 'visiting') {
                const cycle = stack.slice(stack.indexOf(next))
                for (const member of cycle) if (!off.has(member)) off.set(member, {kind: 'cycle', cycle})
            } else if (!state.has(next)) visit(next)
        }
        stack.pop()
        state.set(id, 'done')
    }
    for (const m of candidates) if (!off.has(m.id) && !state.has(m.id)) visit(m.id)

    // A plugin whose requirement is missing or off is off too, and so on down the chain.
    for (let changed = true; changed;) {
        changed = false
        for (const m of candidates) {
            if (off.has(m.id)) continue
            for (const requirement of required(m)) {
                if (byId.has(requirement) && !off.has(requirement)) continue
                off.set(m.id, byId.has(requirement) || installed.has(requirement) ? {kind: 'requirementOff', requirement} : {kind: 'missing', requirement})
                changed = true
                break
            }
        }
    }

    // Dependency order, keeping the candidates' order otherwise. Optional requirements order too when they run; a cycle
    // through optional ones is broken where it's met.
    const order: string[] = []
    const placed = new Set<string>()
    const place = (id: string) => {
        if (placed.has(id)) return
        placed.add(id)
        for (const {id: next} of (byId.get(id)!.requires ?? []).map(parseRequirement)) {
            if (byId.has(next) && !off.has(next)) place(next)
        }
        order.push(id)
    }
    for (const m of candidates) if (!off.has(m.id)) place(m.id)
    return {order, off}
}
