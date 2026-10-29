import type { Panel } from '../types/panel'
import type { Material } from './materials'
import { findMaterial } from './materials'
import { formatMeasurement, roundToUnitGrid, UNIT_SUFFIX, type Unit } from './units'

/** One line of the parts list: a group of identical parts and how many are needed. */
export interface PartRow {
  length: number
  width: number
  thickness: number
  material: string
  color: string
  quantity: number
  parts: string[]
  /** Ids of the panels in this group, so a row can select them in the scene. */
  ids: string[]
}

/** Group panels that share the same size and material into countable rows.
 *  Face dimensions are normalised (longest side first) so a 600x400 and a
 *  400x600 panel are recognised as the same part. Sizes are compared at the
 *  document's display resolution (snapped to the unit grid): if two parts *read*
 *  as the same 13 1/2", they group — no sub-fraction mismatch keeps look-alike
 *  parts apart. The row reports those grid-snapped sizes. */
export function buildParts(panels: Panel[], materials: Material[], unit: Unit, precision: number): PartRow[] {
  const rows = new Map<string, PartRow>()
  const grid = (mm: number) => roundToUnitGrid(mm, unit, precision)

  for (const panel of panels) {
    const [length, width] = [grid(panel.length), grid(panel.width)].sort((a, b) => b - a)
    const thickness = grid(panel.thickness)
    const material = findMaterial(materials, panel.materialId)
    const key = `${length}x${width}x${thickness}@${material.id}`

    const row = rows.get(key)
    if (row) {
      row.quantity += 1
      row.parts.push(panel.name)
      row.ids.push(panel.id)
    } else {
      rows.set(key, {
        length,
        width,
        thickness,
        material: material.name,
        color: material.color,
        quantity: 1,
        parts: [panel.name],
        ids: [panel.id],
      })
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.length - a.length || b.width - a.width || b.thickness - a.thickness,
  )
}

/** The distinct panel names in a row, joined for display. Usually one name
 *  ("Side"); several show when differently-named panels share a size. */
export function partNames(names: string[]): string {
  return [...new Set(names)].join(', ')
}

/** Render the parts list as CSV text (dimensions in `unit`), ready to paste
 *  into a spreadsheet. Inch fractions are quoted so the "/" survives the CSV. */
/** One CSV text field: always quoted, with embedded quotes doubled (RFC 4180),
 *  so commas, quotes and inch fractions in names survive. */
const csvText = (value: string): string => `"${value.replace(/"/g, '""')}"`

export function partsToCsv(rows: PartRow[], unit: Unit): string {
  const u = UNIT_SUFFIX[unit]
  const header = ['Qty', 'Part', `Length (${u})`, `Width (${u})`, `Thickness (${u})`, 'Material']
  const lines = rows.map((r) =>
    [
      r.quantity,
      csvText(partNames(r.parts)),
      csvText(formatMeasurement(r.length, unit)),
      csvText(formatMeasurement(r.width, unit)),
      csvText(formatMeasurement(r.thickness, unit)),
      csvText(r.material),
    ].join(','),
  )
  return [header.join(','), ...lines].join('\n')
}
