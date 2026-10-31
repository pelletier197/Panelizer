import { describe, expect, it } from 'vitest'
import { FINISHES } from './finishes'
import { drawPattern, hasPattern } from './patterns'

const SIZE = 64

describe('drawPattern', () => {
  it('has no pattern for paint', () => {
    expect(hasPattern('paint', undefined)).toBe(false)
    expect(drawPattern('paint', undefined)).toBeNull()
  })

  const variants = FINISHES.flatMap((f) => f.variants.map((v) => [f.id, v.id] as const))

  it.each(variants)('draws %s %s', (finish, variant) => {
    expect(hasPattern(finish, variant)).toBe(true)
    const tile = drawPattern(finish, variant, SIZE)!
    expect(tile.grey).toHaveLength(SIZE * SIZE)
    // Mostly light, so the colour it tints still reads as that colour…
    const mean = tile.grey.reduce((n, g) => n + g, 0) / tile.grey.length
    expect(mean).toBeGreaterThan(150)
    // …but not flat: there is a pattern.
    expect(Math.max(...tile.grey) - Math.min(...tile.grey)).toBeGreaterThan(10)
  })

  it.each(variants)('repeats seamlessly: %s %s', (finish, variant) => {
    // The step across the wrap (last column → first) is no bigger than the
    // pattern's typical step between neighbours.
    const { grey } = drawPattern(finish, variant, SIZE)!
    const at = (x: number, y: number) => grey[y * SIZE + x]
    let inside = 0
    let wrap = 0
    for (let y = 0; y < SIZE; y++) {
      inside += Math.abs(at(1, y) - at(0, y))
      wrap += Math.abs(at(0, y) - at(SIZE - 1, y))
    }
    expect(wrap).toBeLessThan(inside * 3 + SIZE * 4)
  })
})
