import { describe, expect, it } from 'vitest'
import { designToLink, linkToDesign, sharedToken } from './share'
import { DEFAULT_KERF, DEFAULT_MARGIN, type Design } from './persistence'
import { DEFAULT_PRECISION } from './units'
import { defaultMaterials } from './materials'
import type { Panel } from '../types/panel'

/**
 * A shared link has to survive the round trip exactly — someone opening it
 * should get the design that was sent, not an approximation of it.
 *
 * `window.location` and the compression streams come from the environment, so
 * these run against a stubbed location and Node's own CompressionStream.
 */

let seq = 0
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: 'Part',
  normal: 'z',
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  materialId: 'plywood',
  grain: 'length',
  ...over,
})

const design = (over: Partial<Design> = {}): Design => ({
  panels: [panel()],
  materials: defaultMaterials(),
  stocks: [],
  unit: 'mm',
  precision: DEFAULT_PRECISION,
  kerf: DEFAULT_KERF,
  margin: DEFAULT_MARGIN,
  cutStyle: 'guillotine',
  name: 'Cabinet',
  ...over,
})

// jsdom isn't loaded (the suite runs in node), so stand in for the bits of the
// browser this module touches.
const stubLocation = (href = 'https://example.test/Panelizer/', hash = '') => {
  const url = new URL(href)
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: url.origin, pathname: url.pathname, search: '', hash } },
  })
}

describe('designToLink / linkToDesign', () => {
  it('round-trips a design through a link', async () => {
    stubLocation()
    const original = design({
      unit: 'inch',
      precision: 32,
      kerf: 4,
      margin: 12,
      panels: [panel({ name: 'Side', length: 580, grain: 'width' }), panel({ name: 'Top' })],
    })

    const link = await designToLink(original)
    const token = link.split('#design=')[1]
    const back = await linkToDesign(token)

    expect(back.unit).toBe('inch')
    expect(back.precision).toBe(32)
    expect(back.kerf).toBe(4)
    expect(back.margin).toBe(12)
    expect(back.panels).toHaveLength(2)
    expect(back.panels[0]).toMatchObject({ name: 'Side', length: 580, grain: 'width' })
  })

  it('builds a link on the current origin and path', async () => {
    stubLocation('https://sunny.github.io/Panelizer/')
    const link = await designToLink(design())
    expect(link.startsWith('https://sunny.github.io/Panelizer/#design=')).toBe(true)
  })

  it('produces a URL-safe token', async () => {
    stubLocation()
    // Lots of panels, so the payload is big enough to exercise the encoder.
    const many = Array.from({ length: 60 }, (_, i) => panel({ name: `Part ${i}`, length: 100 + i }))
    const link = await designToLink(design({ panels: many }))
    const token = link.split('#design=')[1]
    expect(token).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(await linkToDesign(token)).toMatchObject({ panels: expect.any(Array) })
  })

  it('compresses — a repetitive design is far smaller than its JSON', async () => {
    stubLocation()
    const many = Array.from({ length: 60 }, () => panel())
    const d = design({ panels: many })
    const token = (await designToLink(d)).split('#design=')[1]
    expect(token.length).toBeLessThan(JSON.stringify(d).length / 2)
  })

  it('rejects a corrupt token rather than loading rubbish', async () => {
    stubLocation()
    await expect(linkToDesign('not-a-real-token')).rejects.toThrow()
  })
})

describe('sharedToken', () => {
  it('finds a design in the hash', () => {
    stubLocation('https://example.test/Panelizer/', '#design=abc123')
    expect(sharedToken()).toBe('abc123')
  })

  it('ignores an unrelated hash', () => {
    stubLocation('https://example.test/Panelizer/', '#section-2')
    expect(sharedToken()).toBeNull()
  })

  it('is null with no hash at all', () => {
    stubLocation()
    expect(sharedToken()).toBeNull()
  })
})
