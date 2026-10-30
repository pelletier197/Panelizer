import { describe, expect, it } from 'vitest'
import { buildParts, partNames, partsToCsv } from './parts'
import type { Panel } from '../types/panel'
import type { Material } from './materials'

/**
 * Characterization tests for the parts-list roll-up and its CSV export.
 */

const PLY: Material = { id: 'ply', name: 'Plywood', color: '#d9b380' }
const MDF: Material = { id: 'mdf', name: 'MDF', color: '#9aa0ab' }
const MATERIALS = [PLY, MDF]

let seq = 0
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: 'Part',
  normal: 'z',
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  materialId: PLY.id,
  grain: 'length',
  ...over,
})

describe('buildParts', () => {
  it('counts identical parts into one row', () => {
    const rows = buildParts([panel(), panel(), panel()], MATERIALS, 'mm', 16)
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(3)
    expect(rows[0].ids).toHaveLength(3)
  })

  it('normalises orientation so 600x400 and 400x600 are the same part', () => {
    const rows = buildParts(
      [panel({ length: 600, width: 400 }), panel({ length: 400, width: 600 })],
      MATERIALS,
      'mm',
      16,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(2)
    expect(rows[0].length).toBe(600)
    expect(rows[0].width).toBe(400)
  })

  it('separates parts of different materials', () => {
    const rows = buildParts([panel(), panel({ materialId: MDF.id })], MATERIALS, 'mm', 16)
    expect(rows).toHaveLength(2)
  })

  it('separates parts of different thickness', () => {
    const rows = buildParts([panel({ thickness: 18 }), panel({ thickness: 12 })], MATERIALS, 'mm', 16)
    expect(rows).toHaveLength(2)
  })

  it('groups look-alike sizes that read the same at document precision', () => {
    // 600 and 600.3 both read as 600mm, so they must group.
    const rows = buildParts([panel({ length: 600 }), panel({ length: 600.3 })], MATERIALS, 'mm', 16)
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(2)
    expect(rows[0].length).toBe(600)
  })

  it('reports the grid-snapped size, not the raw float', () => {
    const rows = buildParts([panel({ length: 600.4, width: 399.6 })], MATERIALS, 'mm', 16)
    expect(rows[0].length).toBe(600)
    expect(rows[0].width).toBe(400)
  })

  it('carries material name and colour onto the row', () => {
    const rows = buildParts([panel()], MATERIALS, 'mm', 16)
    expect(rows[0].material).toBe('Plywood')
    expect(rows[0].color).toBe('#d9b380')
  })

  it('collects the distinct panel names in the group', () => {
    const rows = buildParts([panel({ name: 'Side' }), panel({ name: 'Side' })], MATERIALS, 'mm', 16)
    expect(rows[0].parts).toEqual(['Side', 'Side'])
  })

  it('sorts biggest first, by length then width then thickness', () => {
    const rows = buildParts(
      [
        panel({ length: 300, width: 200 }),
        panel({ length: 900, width: 200 }),
        panel({ length: 600, width: 200 }),
      ],
      MATERIALS,
      'mm',
      16,
    )
    expect(rows.map((r) => r.length)).toEqual([900, 600, 300])
  })

  it('falls back to the first material for an unknown id', () => {
    const rows = buildParts([panel({ materialId: 'ghost' })], MATERIALS, 'mm', 16)
    expect(rows[0].material).toBe('Plywood')
  })

  it('returns nothing for no panels', () => {
    expect(buildParts([], MATERIALS, 'mm', 16)).toEqual([])
  })
})

describe('partNames', () => {
  it('dedupes and joins', () => {
    expect(partNames(['Side', 'Side', 'Top'])).toBe('Side, Top')
    expect(partNames(['Side'])).toBe('Side')
    expect(partNames([])).toBe('')
  })
})

describe('partsToCsv', () => {
  it('emits a unit-aware header', () => {
    const rows = buildParts([panel()], MATERIALS, 'mm', 16)
    const csv = partsToCsv(rows, 'mm')
    expect(csv.split('\n')[0]).toBe('Qty,Part,Length (mm),Width (mm),Thickness (mm),Material,Corner radii (mm)')
  })

  it('emits the imperial header when the document is in inches', () => {
    const rows = buildParts([panel()], MATERIALS, 'inch', 16)
    expect(partsToCsv(rows, 'inch').split('\n')[0]).toContain('Length (in)')
  })

  it('writes one line per row with quoted measurements', () => {
    const rows = buildParts([panel(), panel()], MATERIALS, 'mm', 16)
    const lines = partsToCsv(rows, 'mm').split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toBe('2,"Part","600","400","18","Plywood",""')
  })

  it('quotes inch fractions so the slash survives the CSV', () => {
    const rows = buildParts([panel({ length: 0.75 * 25.4 })], MATERIALS, 'inch', 16)
    const line = partsToCsv(rows, 'inch').split('\n')[1]
    expect(line).toContain('"³⁄₄"')
  })

  it('handles an empty parts list (header only)', () => {
    expect(partsToCsv([], 'mm').split('\n')).toHaveLength(1)
  })

  it('doubles an embedded quote in a name', () => {
    const rows = buildParts([panel({ name: 'The "Big" Side' })], MATERIALS, 'mm', 16)
    const line = partsToCsv(rows, 'mm').split('\n')[1]
    expect(line).toContain('"The ""Big"" Side"')
  })

  it('quotes the material so a comma or inch mark in its name survives', () => {
    const odd: Material = { id: 'odd', name: 'Ply, 3/4"', color: '#fff' }
    const rows = buildParts([panel({ materialId: 'odd' })], [odd], 'mm', 16)
    const line = partsToCsv(rows, 'mm').split('\n')[1]
    expect(line.endsWith(',"Ply, 3/4""",""')).toBe(true)
  })
})

describe('buildParts — rounded corners', () => {
  it('keeps a rounded part apart from the same size with square corners', () => {
    const rows = buildParts([panel(), panel({ corners: [20, 0, 0, 0] })], MATERIALS, 'mm', 16)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.corners)?.corners).toEqual([20, 0, 0, 0])
  })

  it('groups mirror images and end-for-end turns as one part', () => {
    const rows = buildParts(
      [panel({ corners: [20, 20, 0, 0] }), panel({ corners: [0, 0, 20, 20] })],
      MATERIALS,
      'mm',
      16,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].quantity).toBe(2)
  })

  it('groups a part drawn width-first with its length-first twin', () => {
    // 400 x 600 with corner 1 rounded is 600 x 400 with corner 3 rounded.
    const rows = buildParts(
      [
        panel({ length: 600, width: 400, corners: [0, 0, 0, 20] }),
        panel({ length: 400, width: 600, corners: [0, 20, 0, 0] }),
      ],
      MATERIALS,
      'mm',
      16,
    )
    expect(rows).toHaveLength(1)
  })

  it('writes the radii into the CSV in the row unit', () => {
    const rows = buildParts([panel({ corners: [20, 0, 10, 0] })], MATERIALS, 'mm', 16)
    expect(partsToCsv(rows, 'mm').split('\n')[1].endsWith(',"20 / 0 / 10 / 0"')).toBe(true)
  })
})
