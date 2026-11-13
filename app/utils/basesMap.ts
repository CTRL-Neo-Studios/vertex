import type {Value} from "@type32/obsidian-bases-parser";
import type {StyleSpecification} from "maplibre-gl";

/**
 * A point as Obsidian's map reads `coordinates` and `center`: a `[lat, lng]` list (numbers or numeric text) or a
 * `"lat, lng"` text. Anything else, or out of range, is no point.
 */
export function latLng(value: Value): [number, number] | null {
    const parts = value.type === 'List' ? value.items : value.type === 'String' ? value.value.split(',') : null
    if (parts?.length !== 2) return null
    const number = (part: Value | string) => {
        if (typeof part === 'string') return Number(part.trim() || NaN)
        if (part.type === 'Number') return part.value
        return part.type === 'String' ? Number(part.value.trim() || NaN) : NaN
    }
    const [lat, lng] = parts.map(number) as [number, number]
    return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null
}

/** OpenFreeMap's styles, Obsidian's defaults. */
export const DEFAULT_STYLES = {light: 'https://tiles.openfreemap.org/styles/bright', dark: 'https://tiles.openfreemap.org/styles/dark'}

/**
 * The map's style from `mapTiles` and `mapTilesDark` (used in dark mode when set): one URL without `{z}` is a style;
 * otherwise each URL is a raster layer, first at the bottom. No URLs: OpenFreeMap.
 */
export function mapStyle(tiles: unknown, darkTiles: unknown, dark: boolean): string | StyleSpecification {
    const urls = (list: unknown) => (Array.isArray(list) ? list.filter((url): url is string => typeof url === 'string' && url.trim() !== '') : [])
    const chosen = dark && urls(darkTiles).length ? urls(darkTiles) : urls(tiles)
    if (!chosen.length) return dark ? DEFAULT_STYLES.dark : DEFAULT_STYLES.light
    if (chosen.length === 1 && !chosen[0]!.includes('{z}')) return chosen[0]!
    return {
        version: 8,
        sources: Object.fromEntries(chosen.map((url, i) => [`tiles-${i}`, {type: 'raster', tiles: [url], tileSize: 256}])),
        layers: chosen.map((_, i) => ({id: `tiles-${i}`, type: 'raster', source: `tiles-${i}`})),
    }
}

/** `lat, lng` to Obsidian's five decimals, as Copy coordinates, Set default center point and New note write them. */
export const pointText = ([lat, lng]: [number, number]) => [lat.toFixed(5), lng.toFixed(5)] as const
