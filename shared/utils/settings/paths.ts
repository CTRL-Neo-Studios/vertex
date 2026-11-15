/** Dotted paths into plain settings objects (`themeConfig.primaryColor`). Every write returns a copy. */

export const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function getAt(target: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((node, key) => (isPlainObject(node) ? node[key] : undefined), target)
}

/** A copy of `target` with `value` at `path`. */
export function withAt<T>(target: T, path: string, value: unknown): T {
    const [key, ...rest] = path.split('.') as [string, ...string[]]
    const node: Record<string, unknown> = isPlainObject(target) ? target : {}
    return {...node, [key]: rest.length ? withAt(node[key], rest.join('.'), value) : value} as T
}

/** A copy of `target` without `path`; objects it leaves empty go too. */
export function withoutAt<T>(target: T, path: string): T {
    if (!isPlainObject(target)) return target
    const [key, ...rest] = path.split('.') as [string, ...string[]]
    if (!(key in target)) return target
    const {[key]: child, ...others} = target
    if (!rest.length) return others as T
    const next = withoutAt(child, rest.join('.'))
    return (isPlainObject(next) && !Object.keys(next).length ? others : {...others, [key]: next}) as T
}
