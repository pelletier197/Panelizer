import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_KERF,
  DEFAULT_MARGIN,
  loadFromStorage,
  parse,
  saveToStorage,
  serialize,
  type Design,
} from './persistence'
import { DEFAULT_PRECISION } from './units'
import { defaultMaterials } from './materials'
import type { Panel } from '../types/panel'

/**
 * Characterization tests for save/load/migrate.
 *
 * The refactor plans to collapse the duplicated default-Design literal into one
 * `defaultDesign()` helper, so the back-fill defaults are pinned exactly here.
 * The environment is `node`, so localStorage is stubbed per-test.
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
  ...over,
})

/** Minimal in-memory localStorage stand-in. */
function stubStorage() {
  const map = new Map<string, string>()
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
  vi.stubGlobal('localStorage', store)
  return map
}

beforeEach(() => {
  vi.unstubAllGlobals()
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

describe('storage', () => {
  it('returns an empty design when storage is empty', () => {
    stubStorage()
    const d = loadFromStorage()
    expect(d.panels).toEqual([])
    expect(d.stocks).toEqual([])
    expect(d.materials).toEqual(defaultMaterials())
    expect(d.unit).toBe('mm')
    expect(d.precision).toBe(DEFAULT_PRECISION)
    expect(d.kerf).toBe(DEFAULT_KERF)
    expect(d.margin).toBe(DEFAULT_MARGIN)
  })

  it('round-trips a saved design', () => {
    stubStorage()
    saveToStorage(design({ unit: 'inch', kerf: 5 }))
    const d = loadFromStorage()
    expect(d.unit).toBe('inch')
    expect(d.kerf).toBe(5)
    expect(d.panels).toHaveLength(1)
  })

  it('falls back to an empty design on corrupt stored JSON', () => {
    const map = stubStorage()
    map.set('panelizer.autosave', '{ broken')
    expect(loadFromStorage().panels).toEqual([])
  })

  it('swallows a failing setItem (autosave is best-effort)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded')
      },
    })
    expect(() => saveToStorage(design())).not.toThrow()
  })

  it('falls back to an empty design when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('unavailable')
      },
    })
    expect(loadFromStorage().panels).toEqual([])
  })
})
