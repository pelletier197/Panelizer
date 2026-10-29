import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KERF,
  DEFAULT_MARGIN,
  DEFAULT_NAME,
  designFilename,
  emptyDesign,
  parse,
  serialize,
  type Design,
} from './persistence'
import { DEFAULT_PRECISION } from './units'
import { defaultMaterials } from './materials'
import type { Panel } from '../types/panel'

/**
 * Characterization tests for the design file format: serialize, parse, and the
 * back-fill of fields older files lack. (Saving to the browser lives in
 * projects.ts and is tested there.)
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
  name: 'Cabinet',
  panels: [panel()],
  materials: defaultMaterials(),
  stocks: [],
  unit: 'mm',
  precision: DEFAULT_PRECISION,
  kerf: DEFAULT_KERF,
  margin: DEFAULT_MARGIN,
  cutStyle: 'guillotine',
  ...over,
})

describe('serialize', () => {
  it('stamps the format tag and version', () => {
    const file = serialize(design())
    expect(file.format).toBe('panelizer')
    expect(file.version).toBe(1)
  })

  it('round-trips through parse unchanged', () => {
    const d = design({ unit: 'inch', precision: 32, kerf: 4, margin: 12 })
    const back = parse(JSON.stringify(serialize(d)))
    expect(back.unit).toBe('inch')
    expect(back.precision).toBe(32)
    expect(back.kerf).toBe(4)
    expect(back.margin).toBe(12)
    expect(back.panels).toHaveLength(1)
  })
})

describe('parse — validation', () => {
  it('throws on unreadable JSON', () => {
    expect(() => parse('not json')).toThrow()
  })

  it('throws when there is no panels array', () => {
    expect(() => parse(JSON.stringify({ format: 'panelizer' }))).toThrow(
      'This file is not a valid Panelizer design.',
    )
  })

  it('accepts a file by shape even without the format tag', () => {
    // Deliberate: files from any past version / name should still import.
    const d = parse(JSON.stringify({ panels: [panel()] }))
    expect(d.panels).toHaveLength(1)
  })

  it('accepts an empty panels array', () => {
    expect(parse(JSON.stringify({ panels: [] })).panels).toEqual([])
  })

  it('drops panels whose geometry is unusable, keeping the rest', () => {
    const raw = {
      panels: [
        panel({ name: 'ok' }),
        { ...panel(), length: 'wide' },
        { ...panel(), width: -5 },
        { ...panel(), normal: 'w' },
        { ...panel(), position: [0, 0] },
        { ...panel(), position: [0, null, 0] },
        null,
      ],
    }
    const d = parse(JSON.stringify(raw))
    expect(d.panels.map((p) => p.name)).toEqual(['ok'])
  })

  it('repairs a missing id and name rather than dropping the panel', () => {
    const raw = { panels: [{ ...panel(), id: undefined, name: 42 }] }
    const [p] = parse(JSON.stringify(raw)).panels
    expect(typeof p.id).toBe('string')
    expect(p.id).not.toBe('')
    expect(p.name).toBe('Panel')
  })

  it('falls back to defaults for unreadable settings', () => {
    const d = parse(JSON.stringify({ panels: [], unit: 'furlong', precision: 0, kerf: -1, margin: 'x' }))
    expect(d.unit).toBe('mm')
    expect(d.precision).toBe(DEFAULT_PRECISION)
    expect(d.kerf).toBe(DEFAULT_KERF)
    expect(d.margin).toBe(DEFAULT_MARGIN)
  })
})

describe('parse — back-filling older files', () => {
  it('supplies the default material list when absent', () => {
    const d = parse(JSON.stringify({ panels: [panel()] }))
    expect(d.materials).toEqual(defaultMaterials())
  })

  it('supplies the default material list when it is empty', () => {
    const d = parse(JSON.stringify({ panels: [panel()], materials: [] }))
    expect(d.materials).toEqual(defaultMaterials())
  })

  it('back-fills the later-added scalar fields', () => {
    const d = parse(JSON.stringify({ panels: [panel()] }))
    expect(d.stocks).toEqual([])
    expect(d.unit).toBe('mm')
    expect(d.precision).toBe(DEFAULT_PRECISION)
    expect(d.kerf).toBe(DEFAULT_KERF)
    expect(d.margin).toBe(DEFAULT_MARGIN)
    // Files from before the setting existed get saw-friendly layouts.
    expect(d.cutStyle).toBe('guillotine')
  })

  it('keeps a free cut style, and rejects an unknown one', () => {
    expect(parse(JSON.stringify({ panels: [], cutStyle: 'free' })).cutStyle).toBe('free')
    expect(parse(JSON.stringify({ panels: [], cutStyle: 'laser' })).cutStyle).toBe('guillotine')
  })

  it('remaps a panel pointing at a missing material onto a valid one', () => {
    const d = parse(JSON.stringify({ panels: [panel({ materialId: 'ghost' })] }))
    expect(d.panels[0].materialId).toBe(defaultMaterials()[0].id)
  })

  it('back-fills grain from the longer edge when absent', () => {
    const raw = { panels: [{ ...panel(), grain: undefined, length: 400, width: 600 }] }
    const d = parse(JSON.stringify(raw))
    expect(d.panels[0].grain).toBe('width')
  })

  it('preserves an explicit grain', () => {
    const d = parse(JSON.stringify({ panels: [panel({ grain: 'none' })] }))
    expect(d.panels[0].grain).toBe('none')
  })

  it('preserves panel thickness as-is (it is not a material property)', () => {
    const d = parse(JSON.stringify({ panels: [panel({ thickness: 6 })] }))
    expect(d.panels[0].thickness).toBe(6)
  })
})

describe('project name', () => {
  it('round-trips through a file', () => {
    expect(parse(JSON.stringify(serialize(design({ name: 'Kitchen island' })))).name).toBe('Kitchen island')
  })

  it('back-fills a default for files from before names existed, or a blank one', () => {
    expect(parse(JSON.stringify({ panels: [] })).name).toBe(DEFAULT_NAME)
    expect(parse(JSON.stringify({ panels: [], name: '   ' })).name).toBe(DEFAULT_NAME)
    expect(parse(JSON.stringify({ panels: [], name: 42 })).name).toBe(DEFAULT_NAME)
  })

  it('is part of an empty design', () => {
    expect(emptyDesign().name).toBe(DEFAULT_NAME)
    expect(emptyDesign().panels).toEqual([])
  })
})

describe('designFilename', () => {
  it('turns a name into a safe file name', () => {
    expect(designFilename('Kitchen Island')).toBe('kitchen-island.panelizer.json')
    expect(designFilename('Étagère  / v2!')).toBe('etagere-v2.panelizer.json')
  })

  it('falls back when nothing usable is left', () => {
    expect(designFilename('???')).toBe('design.panelizer.json')
  })
})
