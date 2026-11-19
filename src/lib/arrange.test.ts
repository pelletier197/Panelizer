import { describe, expect, it } from 'vitest'
import { cantDistribute, distributePanels } from './arrange'
import type { Panel } from '../types/panel'

let seq = 0
const shelf = (y: number, over: Partial<Panel> = {}): Panel => ({
  id: `s${seq++}`,
  name: 'Shelf',
  normal: 'y',
  length: 600,
  width: 300,
  thickness: 18,
  position: [0, y, 0],
  materialId: 'plywood',
  grain: 'length',
  ...over,
})

describe('distributePanels', () => {
  it('spaces the middle parts so every gap is the same, outermost staying put', () => {
    // Bottom at 9, top at 891 (both 18 thick: 0..18 and 882..900); two shelves
    // bunched up near the bottom, given out of order.
    const bottom = shelf(9)
    const top = shelf(891)
    const s1 = shelf(100)
    const s2 = shelf(60)
    const moved = new Map(distributePanels([top, s1, bottom, s2], 1).map((p) => [p.id, p.patch.position![1]]))
    // 900 tall, 4 × 18 of wood, 3 gaps of 276.
    expect(moved.get(s2.id)).toBeCloseTo(18 + 276 + 9)
    expect(moved.get(s1.id)).toBeCloseTo(18 + 276 + 18 + 276 + 9)
    expect(moved.has(bottom.id) || moved.has(top.id)).toBe(false)
  })

  it('needs three parts', () => {
    expect(distributePanels([shelf(0), shelf(100)], 1)).toEqual([])
  })
})

describe('cantDistribute', () => {
  it('allows the axis the parts sit in a row along, whatever their sizes', () => {
    const top = shelf(882, { thickness: 36 }) // 864..900
    expect(cantDistribute([shelf(9), top, shelf(100)], 1)).toBeNull()
  })

  it('refuses an axis the parts overlap along', () => {
    expect(cantDistribute([shelf(9), shelf(891), shelf(100)], 0)).toMatch(/overlap along X/)
  })

  it('refuses parts already evenly spaced', () => {
    expect(cantDistribute([shelf(9), shelf(450), shelf(891)], 1)).toMatch(/Already/)
  })

  it('needs three parts', () => {
    expect(cantDistribute([shelf(0), shelf(100)], 1)).toMatch(/three/)
  })
})
