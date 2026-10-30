import { describe, expect, it } from 'vitest'
import { outline, sheetDxf, sheetDxfFilename } from './dxf'
import type { Placement, SheetLayout, StockGroup } from './nesting'

/** The file as its group code / value pairs. */
function parse(dxf: string): [number, string][] {
  const lines = dxf.trimEnd().split('\n')
  const out: [number, string][] = []
  for (let i = 0; i < lines.length; i += 2) out.push([Number(lines[i]), lines[i + 1]])
  return out
}

interface Entity {
  type: string
  codes: [number, string][]
  vertices: { x: number; y: number; bulge: number }[]
}

/** The ENTITIES section, a polyline's vertices gathered onto it. */
function entities(dxf: string): Entity[] {
  const all = parse(dxf)
  const start = all.findIndex(([c, v], i) => c === 2 && v === 'ENTITIES' && all[i - 1][1] === 'SECTION')
  const list: Entity[] = []
  let polyline: Entity | null = null
  for (const [code, value] of all.slice(start + 1)) {
    if (code === 0) {
      if (value === 'ENDSEC') break
      if (value === 'VERTEX') {
        polyline!.vertices.push({ x: NaN, y: NaN, bulge: 0 })
        continue
      }
      if (value === 'SEQEND') {
        polyline = null
        continue
      }
      const entity: Entity = { type: value, codes: [], vertices: [] }
      list.push(entity)
      if (value === 'POLYLINE') polyline = entity
      continue
    }
    const vertex = polyline?.vertices[polyline.vertices.length - 1]
    if (vertex && code === 10) vertex.x = Number(value)
    else if (vertex && code === 20) vertex.y = Number(value)
    else if (vertex && code === 42) vertex.bulge = Number(value)
    else if (!vertex) list[list.length - 1].codes.push([code, value])
  }
  return list
}

const layer = (e: Entity) => e.codes.find(([c]) => c === 8)?.[1]

const part = (over: Partial<Placement> = {}): Placement => ({
  panelId: 'p1',
  name: 'Side',
  x: 10,
  y: 20,
  w: 500,
  h: 300,
  rotated: false,
  ...over,
})

const sheet = (placements: Placement[]): SheetLayout => ({
  index: 2,
  length: 2440,
  width: 1220,
  placements,
  usedArea: 0,
})

describe('outline', () => {
  it('runs counter-clockwise round a square rectangle', () => {
    expect(outline(0, 0, 100, 50)).toEqual([
      { x: 100, y: 0, bulge: 0 },
      { x: 100, y: 50, bulge: 0 },
      { x: 0, y: 50, bulge: 0 },
      { x: 0, y: 0, bulge: 0 },
    ])
  })

  it('turns a rounded corner into a quarter arc between the two edges', () => {
    // Top-left rounded by 10 (screen order: top-left first).
    const pts = outline(0, 0, 100, 50, [10, 0, 0, 0])
    expect(pts).toHaveLength(5)
    expect(pts[2]).toEqual({ x: 10, y: 50, bulge: Math.tan(Math.PI / 8) }) // leaves the top edge…
    expect(pts[3]).toEqual({ x: 0, y: 40, bulge: 0 }) // …and lands on the left one
  })
})

describe('sheetDxf', () => {
  it('declares millimetres and R12', () => {
    const codes = parse(sheetDxf(sheet([])))
    const after = (name: string) => codes[codes.findIndex(([, v]) => v === name) + 1]
    expect(after('$ACADVER')).toEqual([1, 'AC1009'])
    expect(after('$INSUNITS')).toEqual([70, '4'])
    expect(codes[codes.length - 1]).toEqual([0, 'EOF'])
  })

  it('draws the sheet, then each part as a closed outline with Y flipped up', () => {
    const [outlineOfSheet, piece, text] = entities(sheetDxf(sheet([part()])))
    expect(layer(outlineOfSheet)).toBe('SHEET')
    expect(outlineOfSheet.vertices.map((v) => [v.x, v.y])).toEqual([
      [2440, 0],
      [2440, 1220],
      [0, 1220],
      [0, 0],
    ])

    expect(layer(piece)).toBe('PARTS')
    expect(piece.codes).toContainEqual([70, '1']) // closed
    // 20 mm from the sheet's top edge, 300 tall: its bottom sits at 1220 − 320.
    expect(piece.vertices.map((v) => [v.x, v.y])).toEqual([
      [510, 900],
      [510, 1200],
      [10, 1200],
      [10, 900],
    ])

    expect(text.type).toBe('TEXT')
    expect(layer(text)).toBe('LABELS')
    expect(text.codes).toContainEqual([1, 'Side 500 x 300'])
    expect(text.codes).toContainEqual([11, '260'])
    expect(text.codes).toContainEqual([21, '1050'])
  })

  it('keeps rounded corners as arcs where they sit on the sheet', () => {
    const [, piece] = entities(sheetDxf(sheet([part({ corners: [0, 0, 40, 0] })]))) // bottom-right
    expect(piece.vertices).toHaveLength(5)
    expect(piece.vertices[0]).toEqual({ x: 470, y: 900, bulge: expect.closeTo(0.4142, 4) })
    expect(piece.vertices[1]).toEqual({ x: 510, y: 940, bulge: 0 })
  })

  it('writes names as one line of ASCII', () => {
    const [, , text] = entities(sheetDxf(sheet([part({ name: 'Tablette\nà pain' })])))
    expect(text.codes).toContainEqual([1, 'Tablette \\U+00E0 pain 500 x 300'])
  })
})

describe('sheetDxfFilename', () => {
  it('names the project, material, thickness and sheet', () => {
    const group = { materialName: 'Baltic Birch', thickness: 18 } as StockGroup
    expect(sheetDxfFilename('Nightstand', group, sheet([]))).toBe('nightstand-baltic-birch-18mm-sheet-2.dxf')
    expect(sheetDxfFilename('', group, sheet([]))).toBe('panelizer-baltic-birch-18mm-sheet-2.dxf')
  })
})
