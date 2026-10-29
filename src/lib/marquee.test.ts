import { describe, expect, it } from 'vitest'
import { convexHull, panelsInRect, polygonTouchesRect, rectFromDrag, ruleForDrag } from './marquee'
import type { Panel } from '../types/panel'
import type { Point } from './corners'

let seq = 0
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: 'Part',
  normal: 'z',
  length: 100,
  width: 100,
  thickness: 10,
  position: [0, 0, 0],
  materialId: 'plywood',
  grain: 'length',
  ...over,
})

/** A straight-on orthographic "camera": world mm map 1:1 to pixels, with
 *  screen y pointing down. Anything with z > 1000 counts as behind it. */
const flat = (p: Point): [number, number] | null => (p[2] > 1000 ? null : [p[0], -p[1]])

describe('drag helpers', () => {
  it('reads the rule from the drag direction', () => {
    expect(ruleForDrag(10, 50)).toBe('enclose')
    expect(ruleForDrag(50, 10)).toBe('touch')
  })

  it('normalises a drag in any direction into a rectangle', () => {
    expect(rectFromDrag([50, 40], [10, 0])).toEqual({ x: 10, y: 0, w: 40, h: 40 })
  })
})

describe('panelsInRect', () => {
  // Panel spans x -50..50, screen y -50..50.
  const p = panel()

  it('enclose picks a panel entirely inside the box', () => {
    expect(panelsInRect([p], flat, { x: -60, y: -60, w: 120, h: 120 }, 'enclose')).toEqual([p.id])
  })

  it('enclose skips a panel the box only partly covers', () => {
    expect(panelsInRect([p], flat, { x: 0, y: -60, w: 120, h: 120 }, 'enclose')).toEqual([])
  })

  it('touch picks a panel the box only partly covers', () => {
    expect(panelsInRect([p], flat, { x: 0, y: -60, w: 120, h: 120 }, 'touch')).toEqual([p.id])
  })

  it('touch skips a panel the box misses', () => {
    expect(panelsInRect([p], flat, { x: 60, y: 60, w: 10, h: 10 }, 'touch')).toEqual([])
  })

  it('never picks a hidden panel', () => {
    const ghost = panel({ hidden: true })
    expect(panelsInRect([ghost], flat, { x: -200, y: -200, w: 400, h: 400 }, 'touch')).toEqual([])
  })

  it('skips a panel that reaches behind the camera', () => {
    const behind = panel({ position: [0, 0, 1000] })
    expect(panelsInRect([behind], flat, { x: -200, y: -200, w: 400, h: 400 }, 'touch')).toEqual([])
  })
})

describe('touch uses the real silhouette, not its bounding box', () => {
  // A diamond: its bounding box is the square (0,0)-(100,100), but the corner
  // region near (5,5) is outside the diamond itself.
  const diamond = convexHull([
    [50, 0],
    [100, 50],
    [50, 100],
    [0, 50],
  ])

  it('misses a box in the empty corner of the bounding square', () => {
    expect(polygonTouchesRect(diamond, { x: 0, y: 0, w: 10, h: 10 })).toBe(false)
  })

  it('hits a box over the diamond', () => {
    expect(polygonTouchesRect(diamond, { x: 40, y: 40, w: 5, h: 5 })).toBe(true)
  })

  it('hits a box that contains the diamond', () => {
    expect(polygonTouchesRect(diamond, { x: -10, y: -10, w: 200, h: 200 })).toBe(true)
  })
})

describe('convexHull', () => {
  it('drops interior points', () => {
    const hull = convexHull([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5],
    ])
    expect(hull).toHaveLength(4)
    expect(hull).not.toContainEqual([5, 5])
  })
})
