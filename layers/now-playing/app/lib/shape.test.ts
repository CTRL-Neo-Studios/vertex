import {describe, expect, it} from 'vitest'
import {position} from './media'
import {ease, heights} from './shape'

describe('heights', () => {
    it('is nothing at the ends, tallest in the middle, and the same both sides', () => {
        const h = heights(new Uint8Array(32).fill(255), 41)
        expect(h[0]).toBeCloseTo(0)
        expect(h[40]).toBeCloseTo(0)
        expect(h[20]).toBeCloseTo(1)
        for (let i = 0; i < 20; i++) expect(h[i]).toBeCloseTo(h[40 - i]!)
    })

    it('puts the lowest band in the middle and the highest at the ends', () => {
        const bass = new Uint8Array(32)
        bass[0] = 255
        const h = heights(bass, 41)
        expect(h[20]).toBeGreaterThan(0.9)
        expect(h[5]).toBe(0)
    })

    it('is flat without levels', () => {
        expect([...heights(undefined, 5)]).toEqual([0, 0, 0, 0, 0])
    })
})

describe('ease', () => {
    it('rises at once, falls slowly, and settles', () => {
        const shown = new Float32Array(1)
        expect(ease(shown, Float32Array.of(1))).toBe(true)
        expect(shown[0]).toBe(1)
        ease(shown, Float32Array.of(0))
        expect(shown[0]).toBeCloseTo(0.82)
        let steps = 0
        while (ease(shown, Float32Array.of(0))) steps++
        expect(shown[0]).toBe(0)
        expect(steps).toBeLessThan(40)
    })
})

describe('position', () => {
    const track = {app: null, playing: true, title: null, artist: null, album: null, duration: 200, elapsed: 10, rate: 1, timestamp: '2026-11-20T00:00:00Z'}

    it('moves on from its timestamp at its rate, never past the end', () => {
        const at = Date.parse('2026-11-20T00:00:05Z')
        expect(position(track, at)).toBeCloseTo(15)
        expect(position({...track, rate: 0}, at)).toBeCloseTo(10)
        expect(position(track, Date.parse('2026-11-20T01:00:00Z'))).toBe(200)
        expect(position({...track, elapsed: null}, at)).toBeUndefined()
    })
})
