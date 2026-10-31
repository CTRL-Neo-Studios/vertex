/**
 * Picks the UI locale: an explicit setting wins; `system` matches the OS languages against the available
 * locales (exact code first, then language prefix, e.g. `zh-Hans-CN` → `zh-CN`), falling back to `fallback`.
 */
export function resolveLocale(setting: string, available: string[], systemLanguages: readonly string[], fallback = 'en'): string {
    if (setting !== 'system' && available.includes(setting)) return setting
    for (const lang of systemLanguages) {
        const exact = available.find(a => a.toLowerCase() === lang.toLowerCase())
        if (exact) return exact
        const prefix = lang.split('-')[0]!.toLowerCase()
        const partial = available.find(a => a.split('-')[0]!.toLowerCase() === prefix)
        if (partial) return partial
    }
    return fallback
}
