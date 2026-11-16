import {describe, expect, it} from "vitest";
import {fromFrontmatter} from "@type32/obsidian-bases-parser";
import {DEFAULT_STYLES, latLng, mapStyle} from "./basesMap";

const value = (raw: unknown) => fromFrontmatter(raw, 'n.md')

describe('latLng', () => {
    it('reads the points Obsidian marked, and none of the rest', () => {
        expect(latLng(value([51.5074, -0.1278]))).toEqual([51.5074, -0.1278])
        expect(latLng(value('48.8566, 2.3522'))).toEqual([48.8566, 2.3522])
        expect(latLng(value(['50.0', '1.5']))).toEqual([50, 1.5])
        for (const bad of ['nope', [1, 2, 3], ['', 1], [91, 0], [0, 181], null]) expect(latLng(value(bad))).toBeNull()
    })
})

describe('mapStyle', () => {
    it('defaults to OpenFreeMap; one URL without {z} is a style; tile URLs are raster layers; dark tiles only in dark', () => {
        expect(mapStyle([], undefined, false)).toBe(DEFAULT_STYLES.light)
        expect(mapStyle(undefined, [], true)).toBe(DEFAULT_STYLES.dark)
        expect(mapStyle(['https://x/style.json'], undefined, true)).toBe('https://x/style.json')
        expect(mapStyle(['https://a/{z}/{x}/{y}.png'], ['https://d/style.json'], false)).toMatchObject({
            sources: {'tiles-0': {type: 'raster', tiles: ['https://a/{z}/{x}/{y}.png']}},
            layers: [{id: 'tiles-0', type: 'raster', source: 'tiles-0'}],
        })
        expect(mapStyle(['https://a/{z}/{x}/{y}.png'], ['https://d/style.json'], true)).toBe('https://d/style.json')
    })
})
