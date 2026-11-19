import { describe, expect, it } from 'vitest'
import { mirrorPanel, mirroredCopies } from './mirror'
import { solidsOf } from './cuts'
import { setJoint } from './joints'
import { unionBounds } from './framing'
import type { Bounds } from './bounds'
import type { Panel } from '../types/panel'

let seq = 0
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: 'Part',
  normal: 'x', // a side: thickness along X, face in YZ
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  materialId: 'plywood',
  grain: 'length',
  ...over,
})

const volume = (boxes: Bounds[]) =>
  boxes.reduce((sum, b) => sum + (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]), 0)

describe('mirrorPanel', () => {
  it('moves the centre across the plane and keeps the box', () => {
    const p = panel({ position: [100, 50, -20] })
    const m = mirrorPanel(p, 0, 300)
    expect(m.position).toEqual([500, 50, -20])
    expect([m.normal, m.length, m.width, m.thickness, m.grain]).toEqual([p.normal, p.length, p.width, p.thickness, p.grain])
  })

  it('swaps rounded corners across the face', () => {
    // Along the thickness nothing changes; along either face axis two pairs
    // of corners trade places.
    const p = panel({ corners: [10, 20, 30, 40] })
    expect(mirrorPanel(p, 0, 0).corners).toEqual([10, 20, 30, 40])
    const a = mirrorPanel(p, 1, 0).corners!
    const b = mirrorPanel(p, 2, 0).corners!
    expect(new Set([a.join(), b.join()])).toEqual(new Set(['20,10,40,30', '40,30,20,10']))
    // Mirroring twice puts them back.
    expect(mirrorPanel(mirrorPanel(p, 1, 0), 1, 0).corners).toEqual(p.corners)
  })

  it('flips a lap half along the mirror axis only', () => {
    const p = panel({ cuts: [{ by: 'a', half: { axis: 1, side: 1 } }, { by: 'b', half: { axis: 0, side: -1 } }, { by: 'c' }] })
    expect(mirrorPanel(p, 1, 0).cuts).toEqual([
      { by: 'a', half: { axis: 1, side: -1 } },
      { by: 'b', half: { axis: 0, side: -1 } },
      { by: 'c' },
    ])
  })
})

describe('mirroredCopies', () => {
  it('lands the copy against the far face of the selection', () => {
    const left = panel({ position: [0, 300, 0] })
    const shelf = panel({ normal: 'y', length: 400, width: 300, position: [209, 300, 0] })
    const copies = mirroredCopies([left, shelf], 0, 1)
    const before = unionBounds([left, shelf])!
    const after = unionBounds(copies)!
    expect(after.min[0]).toBeCloseTo(before.max[0])
    expect(after.max[0] - after.min[0]).toBeCloseTo(before.max[0] - before.min[0])
    // Shift side: against the near face instead.
    expect(unionBounds(mirroredCopies([left, shelf], 0, -1))!.max[0]).toBeCloseTo(before.min[0])
  })

  it('keeps a half lap a half lap', () => {
    // Two rails crossing in X / Z, half lapped along Y.
    const a = panel({ id: 'a', normal: 'y', length: 400, width: 40, position: [0, 0, 0] })
    const b = panel({ id: 'b', normal: 'y', length: 40, width: 400, position: [0, 0, 0] })
    let parts = [a, b]
    for (const { id, patch } of setJoint(a, b, 'lap')) parts = parts.map((p) => (p.id === id ? { ...p, ...patch } : p))
    const original = solidsOf(parts)

    // Mirror up Y: the halves trade places but each part keeps half its wood
    // and the two still don't share any.
    const copies = mirroredCopies(parts, 1, 1)
    const mirrored = solidsOf(copies)
    for (const id of ['a', 'b']) expect(volume(mirrored.get(id)!)).toBeCloseTo(volume(original.get(id)!))
    const [ca, cb] = [mirrored.get('a')!, mirrored.get('b')!]
    const shared = ca.some((x) =>
      cb.some((y) => [0, 1, 2].every((k) => Math.min(x.max[k], y.max[k]) - Math.max(x.min[k], y.min[k]) > 0.01)),
    )
    expect(shared).toBe(false)
  })
})
