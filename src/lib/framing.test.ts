import { describe, expect, it } from 'vitest'
import { frameBounds, unionBounds } from './framing'
import type { Panel } from '../types/panel'

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

describe('unionBounds', () => {
  it('is null for no panels', () => {
    expect(unionBounds([])).toBeNull()
  })

  it('encloses every panel', () => {
    const b = unionBounds([panel(), panel({ position: [500, 0, 0] })])!
    expect(b.min).toEqual([-50, -50, -5])
    expect(b.max).toEqual([550, 50, 5])
  })
})

describe('frameBounds', () => {
  const bounds = { min: [-100, -100, -100] as [number, number, number], max: [100, 100, 100] as [number, number, number] }

  it('targets the box centre and keeps the viewing direction', () => {
    const { target, position } = frameBounds(
      { min: [0, 0, 0], max: [200, 200, 200] },
      [0, 0, 1],
      45,
      1,
    )
    expect(target).toEqual([100, 100, 100])
    expect(position[0]).toBeCloseTo(100)
    expect(position[1]).toBeCloseTo(100)
    expect(position[2]).toBeGreaterThan(100)
  })

  it('backs off far enough that the bounding sphere fits the field of view', () => {
    const { position } = frameBounds(bounds, [0, 0, 1], 45, 1)
    const radius = Math.hypot(200, 200, 200) / 2
    const half = (45 * Math.PI) / 360
    expect(radius / position[2]).toBeLessThanOrEqual(Math.sin(half))
  })

  it('backs off further in a tall, narrow viewport', () => {
    const wide = frameBounds(bounds, [0, 0, 1], 45, 2).position[2]
    const tall = frameBounds(bounds, [0, 0, 1], 45, 0.5).position[2]
    expect(tall).toBeGreaterThan(wide)
  })
})
