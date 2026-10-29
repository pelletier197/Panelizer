import { describe, expect, it } from 'vitest'
import { resizeAlongAxis, resizeGroup, resizeRestore } from './resize'
import { axisField } from './geometry'
import type { Panel } from '../types/panel'

let seq = 0
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: 'Part',
  normal: 'z', // face in XY: length runs along X, width along Y
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  materialId: 'plywood',
  grain: 'length',
  ...over,
})

describe('resizeAlongAxis', () => {
  it('moves one face and holds the other', () => {
    const r = resizeAlongAxis(panel(), 0, 1, 50)!
    expect(r.field).toBe('length')
    expect(r.value).toBe(650)
    expect(r.position).toEqual([25, 0, 0])
  })

  it('refuses the thickness axis', () => {
    expect(resizeAlongAxis(panel(), 2, 1, 50)).toBeNull()
  })
})

describe('resizeGroup', () => {
  it('applies the same face displacement to every panel, each holding its own far face', () => {
    const a = panel({ position: [0, 0, 0] })
    const b = panel({ length: 300, position: [1000, 0, 0] })
    const [pa, pb] = resizeGroup([a, b], 0, 1, 50)
    expect(pa.patch).toEqual({ length: 650, position: [25, 0, 0] })
    expect(pb.patch).toEqual({ length: 350, position: [1025, 0, 0] })
  })

  it('resizes whichever field lies along the axis for each panel', () => {
    // Panels in different orientations map world Y to different fields; each
    // one's extent along Y grows by the same amount.
    const back = panel({ normal: 'z' })
    const side = panel({ normal: 'x', length: 580, width: 720 })
    const patches = resizeGroup([back, side], 1, 1, 20)
    expect(patches).toHaveLength(2)
    patches.forEach((p, i) => {
      const before = [back, side][i]
      const field = axisField(before.normal, 1) as 'length' | 'width'
      expect(p.patch[field]).toBe(before[field] + 20)
    })
  })

  it('leaves out panels whose thickness runs along the axis', () => {
    const facing = panel({ normal: 'z' })
    const across = panel({ normal: 'x' })
    const patches = resizeGroup([facing, across], 0, 1, 50)
    expect(patches.map((p) => p.id)).toEqual([facing.id])
  })

  it('symmetric resize keeps every centre and grows by twice the delta', () => {
    const [p] = resizeGroup([panel({ position: [100, 0, 0] })], 0, -1, -10, true)
    expect(p.patch).toEqual({ length: 620, position: [100, 0, 0] })
  })

  it('on commit, rounds each size and recomputes the centre from the held face', () => {
    const round = (mm: number) => Math.round(mm / 10) * 10
    const [p] = resizeGroup([panel()], 0, 1, 33, false, round)
    // 633 rounds to 630; far face stays at -300, so the centre is -300 + 315.
    expect(p.patch).toEqual({ length: 630, position: [15, 0, 0] })
  })
})

describe('resizeRestore', () => {
  it('captures the fields a resize touches', () => {
    const p = panel({ position: [1, 2, 3] })
    expect(resizeRestore([p])).toEqual([
      { id: p.id, patch: { length: 600, width: 400, position: [1, 2, 3] } },
    ])
  })
})
