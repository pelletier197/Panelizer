import { describe, expect, it } from 'vitest'
import { cornerKey, cornerRadii, hasRounding, roundedOutline, roundedRectPath, sheetCornerRadii } from './rounding'

describe('cornerRadii', () => {
  it('treats a panel without corners as square', () => {
    expect(cornerRadii({ length: 600, width: 400 })).toEqual([0, 0, 0, 0])
    expect(hasRounding({ length: 600, width: 400 })).toBe(false)
  })

  it('caps each radius at half the shorter side, and floors at zero', () => {
    expect(cornerRadii({ length: 600, width: 400, corners: [50, 500, -5, 200] })).toEqual([50, 200, 0, 200])
  })
})

describe('roundedOutline', () => {
  it('is the plain rectangle when nothing is rounded', () => {
    expect(roundedOutline(600, 400, [0, 0, 0, 0])).toEqual([
      [-300, -200],
      [300, -200],
      [300, 200],
      [-300, 200],
    ])
  })

  it('rounds only the corners asked for, staying inside the rectangle', () => {
    const pts = roundedOutline(600, 400, [50, 0, 0, 0], 4)
    // 5 points for the rounded corner, then one for each square corner.
    expect(pts).toHaveLength(8)
    expect(pts[0][0]).toBeCloseTo(-300) // arc starts on the left edge…
    expect(pts[0][1]).toBeCloseTo(-150)
    expect(pts[4][0]).toBeCloseTo(-250) // …and ends on the bottom edge
    expect(pts[4][1]).toBeCloseTo(-200)
    for (const [u, v] of pts) {
      expect(Math.abs(u)).toBeLessThanOrEqual(300 + 1e-9)
      expect(Math.abs(v)).toBeLessThanOrEqual(200 + 1e-9)
    }
  })
})

describe('roundedRectPath', () => {
  it('draws a plain rectangle with no arcs', () => {
    expect(roundedRectPath(0, 0, 100, 50, [0, 0, 0, 0])).toBe('M0,0 H100 V50 H0 V0 Z')
  })

  it('arcs only the rounded corners', () => {
    const d = roundedRectPath(0, 0, 100, 50, [10, 0, 0, 0])
    expect(d.match(/A/g)).toHaveLength(1)
    expect(d.startsWith('M10,0')).toBe(true)
  })
})

describe('sheetCornerRadii', () => {
  const panel = { length: 600, width: 400, corners: [1, 2, 3, 4] as [number, number, number, number] }

  it('maps corner 0 to the top-left when unturned', () => {
    expect(sheetCornerRadii(panel, false)).toEqual([1, 2, 3, 4])
  })

  it('moves every corner one place round when turned (a rotation, not a mirror)', () => {
    expect(sheetCornerRadii(panel, true)).toEqual([2, 3, 4, 1])
  })
})

describe('cornerKey', () => {
  it('is empty for a square-cornered part', () => {
    expect(cornerKey([0, 0, 0, 0], false)).toBe('')
  })

  it('matches a part turned end for end or flipped over', () => {
    const one = cornerKey([10, 10, 0, 0], false)
    expect(cornerKey([0, 0, 10, 10], false)).toBe(one) // turned end for end
    expect(cornerKey([10, 10, 0, 0], false)).toBe(one)
  })

  it('tells adjacent rounded corners from diagonal ones', () => {
    expect(cornerKey([10, 10, 0, 0], false)).not.toBe(cornerKey([10, 0, 10, 0], false))
  })

  it('tells rounding along the length from rounding along the width on a non-square part', () => {
    // Corners 0+1 share the -v edge (a long edge); 1+2 share the +u edge (a short one).
    expect(cornerKey([10, 10, 0, 0], false)).not.toBe(cornerKey([0, 10, 10, 0], false))
  })

  it('treats those as the same on a square part, which can turn a quarter', () => {
    expect(cornerKey([10, 10, 0, 0], true)).toBe(cornerKey([0, 10, 10, 0], true))
  })
})
