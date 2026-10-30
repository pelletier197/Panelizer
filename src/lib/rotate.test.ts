import { describe, expect, it } from 'vitest'
import { rotatePanels } from './rotate'
import { axisField, panelBoxSize } from './geometry'
import type { Panel } from '../types/panel'

let seq = 0
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: 'Part',
  normal: 'y', // a shelf: thickness up Y, face in XZ
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  materialId: 'plywood',
  grain: 'length',
  ...over,
})

const apply = (p: Panel, patch: Partial<Panel>): Panel => ({ ...p, ...patch })

/** The world direction (0/1/2) the grain physically runs along. */
const grainAxis = (p: Panel) => [0, 1, 2].find((a) => axisField(p.normal, a as 0 | 1 | 2) === p.grain)

describe('rotatePanels — a single panel', () => {
  it('turns in place: its box extents in the turning plane swap', () => {
    const p = panel()
    const before = panelBoxSize(p)
    const [{ patch }] = rotatePanels([p], 0, 1) // about X: Y ↔ Z
    const after = panelBoxSize(apply(p, patch))
    expect(after).toEqual([before[0], before[2], before[1]])
    expect(patch.position).toEqual([0, 0, 0])
  })

  it('stands a shelf up into a back when turned about X', () => {
    const [{ patch }] = rotatePanels([panel()], 0, 1)
    expect(patch.normal).toBe('z')
  })

  it('keeps thickness, whatever the turn', () => {
    for (const about of [0, 1, 2] as const) {
      const p = panel()
      const [{ patch }] = rotatePanels([p], about, 1)
      const q = apply(p, patch)
      expect(panelBoxSize(q)[['x', 'y', 'z'].indexOf(q.normal)]).toBe(18)
    }
  })

  it('turning in its own plane swaps length and width, and the grain follows the wood', () => {
    const p = panel() // shelf: about Y is in its own plane
    const [{ patch }] = rotatePanels([p], 1, 1)
    const q = apply(p, patch)
    expect(q.normal).toBe('y')
    expect([q.length, q.width].sort()).toEqual([400, 600])
    // Grain ran along X before; after a quarter turn about Y it runs along Z.
    expect(grainAxis(p)).toBe(0)
    expect(grainAxis(q)).toBe(2)
  })

  it('leaves a grain-free part grain-free', () => {
    const [{ patch }] = rotatePanels([panel({ grain: 'none' })], 1, 1)
    expect(patch.grain).toBeUndefined()
  })

  it('four quarter turns come back to the start', () => {
    for (const about of [0, 1, 2] as const) {
      let p = panel({ position: [10, 20, 30] })
      for (let i = 0; i < 4; i++) p = apply(p, rotatePanels([p], about, 1)[0].patch)
      expect(p.normal).toBe('y')
      expect(p.length).toBe(600)
      expect(p.width).toBe(400)
      expect(p.grain).toBe('length')
      expect(p.position).toEqual([10, 20, 30])
    }
  })

  it('a turn one way then the other is a no-op', () => {
    const p = panel({ normal: 'x', position: [5, 6, 7] })
    const q = apply(p, rotatePanels([p], 2, 1)[0].patch)
    const back = apply(q, rotatePanels([q], 2, -1)[0].patch)
    expect(back).toEqual(p)
  })
})

describe('rotatePanels — a group', () => {
  it('turns rigidly about the centre of the group', () => {
    // Two shelves 1000 apart on X, pivot at x = 500.
    const a = panel({ position: [0, 0, 0] })
    const b = panel({ position: [1000, 0, 0] })
    // +90° about Y takes +Z onto +X, and so +X onto −Z.
    const [pa, pb] = rotatePanels([a, b], 1, 1)
    expect(pa.patch.position![0]).toBeCloseTo(500)
    expect(pb.patch.position![0]).toBeCloseTo(500)
    expect(pa.patch.position![2]).toBeCloseTo(500)
    expect(pb.patch.position![2]).toBeCloseTo(-500)
  })

  it('returns nothing for no panels', () => {
    expect(rotatePanels([], 0, 1)).toEqual([])
  })
})

describe('rotatePanels — corner radii', () => {
  /** World position of each rounded corner (radius > 0), as "x,y,z" sign strings. */
  const roundedCornerSpots = (p: Panel) => {
    const lengthAxis = [0, 1, 2].find((a) => axisField(p.normal, a as 0 | 1 | 2) === 'length')!
    const widthAxis = [0, 1, 2].find((a) => axisField(p.normal, a as 0 | 1 | 2) === 'width')!
    const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    return (p.corners ?? [])
      .map((r, i) => {
        if (r <= 0) return null
        const w = [0, 0, 0]
        w[lengthAxis] = signs[i][0]
        w[widthAxis] = signs[i][1]
        return `${w.join(',')}=${r}`
      })
      .filter(Boolean)
      .sort()
  }

  it('keeps the radii intact, and four turns bring each one home', () => {
    for (const about of [0, 1, 2] as const) {
      for (const dir of [1, -1] as const) {
        const p = panel({ corners: [10, 20, 30, 40] })
        const q = apply(p, rotatePanels([p], about, dir)[0].patch)
        expect(q.corners!.slice().sort((a, b) => a - b)).toEqual([10, 20, 30, 40])
        let r = p
        for (let i = 0; i < 4; i++) r = apply(r, rotatePanels([r], about, dir)[0].patch)
        expect(r.corners).toEqual([10, 20, 30, 40])
      }
    }
  })

  it("moves a radius to where the turn takes its physical corner", () => {
    // A shelf's corner 0 sits at (−X, −Z). A +90° turn about Y takes
    // (x, z) to (z, −x), so that corner ends up at (−X, +Z).
    const p = panel({ corners: [10, 0, 0, 0] })
    expect(roundedCornerSpots(p)).toEqual(['-1,0,-1=10'])
    const q = apply(p, rotatePanels([p], 1, 1)[0].patch)
    expect(roundedCornerSpots(q)).toEqual(['-1,0,1=10'])
  })

  it('follows the corner when a turn stands the panel up', () => {
    // About X, +90°: (y, z) to (−z, y). The shelf's (−X, −Z) corner, at
    // y = 0, goes to (−X, +Y) on the now-upright panel.
    const p = panel({ corners: [10, 0, 0, 0] })
    const q = apply(p, rotatePanels([p], 0, 1)[0].patch)
    expect(roundedCornerSpots(q)).toEqual(['-1,1,0=10'])
  })

  it('leaves a square-cornered panel without corners', () => {
    const [{ patch }] = rotatePanels([panel()], 0, 1)
    expect(patch.corners).toBeUndefined()
  })
})
