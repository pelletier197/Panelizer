import type { SheetLayout, StockGroup } from './nesting'
import { slugify } from './persistence'
import type { CornerRadii } from './rounding'

/**
 * A cutlist sheet as a DXF drawing, for CNC: load it into CAM software
 * (VCarve, Carbide Create, Fusion…), pick a bit and depths there, and it makes
 * the toolpaths and G-code for the machine.
 *
 * Written as DXF R12, the version every CAM program reads, in millimetres
 * whatever the project's unit. The drawing's origin is the sheet's
 * bottom-left corner and Y runs up, as CAD does, so the layout reads the same
 * way up as on screen. Three layers, so each can be picked on its own:
 *  - `SHEET`  the sheet's outline, for lining the drawing up with the stock
 *  - `PARTS`  each part as one closed outline; rounded corners are true arcs
 *  - `LABELS` each part's name and size, to read only
 */

const SQUARE: CornerRadii = [0, 0, 0, 0]

/** Bulge of a vertex starting a quarter-circle arc, counter-clockwise:
 *  tan(90° / 4). */
const QUARTER_BULGE = Math.tan(Math.PI / 8)

const LAYERS = [
  { name: 'SHEET', color: 8 }, // grey
  { name: 'PARTS', color: 7 }, // white / black, by background
  { name: 'LABELS', color: 3 }, // green
] as const
type Layer = (typeof LAYERS)[number]['name']

/** A vertex of an outline, with the bulge of the segment that leaves it
 *  (0 for a straight edge). */
interface Vertex {
  x: number
  y: number
  bulge: number
}

/** A number as DXF wants it: plain decimal, no exponent, no float noise. */
const num = (n: number) => String(Math.round(n * 1e4) / 1e4 + 0) // + 0 turns -0 into 0

/** Text as R12 stores it: one line, ASCII, anything else as \U+XXXX. */
const text = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\x20-\x7e]/gu, (c) => `\\U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)

/** Group code / value pairs, one per line, as DXF is written. */
const pairs = (...items: (string | number)[]) => {
  const lines: string[] = []
  for (let i = 0; i < items.length; i += 2) lines.push(String(items[i]), String(items[i + 1]))
  return lines
}

function polyline(layer: Layer, vertices: Vertex[]): string[] {
  return [
    ...pairs(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, 1), // 70 = 1: closed
    ...vertices.flatMap((v) =>
      pairs(0, 'VERTEX', 8, layer, 10, num(v.x), 20, num(v.y), 30, 0, ...(v.bulge ? [42, num(v.bulge)] : [])),
    ),
    ...pairs(0, 'SEQEND', 8, layer),
  ]
}

/**
 * The outline of a w × h rectangle whose bottom-left corner is at (x, y), Y up,
 * counter-clockwise from its bottom-right corner. `radii` are in the cutlist's
 * screen order [top-left, top-right, bottom-right, bottom-left]; a rounded
 * corner becomes a quarter arc, a square one a single vertex.
 */
export function outline(x: number, y: number, w: number, h: number, radii: CornerRadii = SQUARE): Vertex[] {
  const [tl, tr, br, bl] = radii
  const x1 = x + w
  const y1 = y + h
  // Each corner: where the arc starts (on the edge coming in), where it ends
  // (on the edge going out), and the square corner if it isn't rounded.
  const corners: [number, [number, number], [number, number], [number, number]][] = [
    [br, [x1 - br, y], [x1, y + br], [x1, y]],
    [tr, [x1, y1 - tr], [x1 - tr, y1], [x1, y1]],
    [tl, [x + tl, y1], [x, y1 - tl], [x, y1]],
    [bl, [x, y + bl], [x + bl, y], [x, y]],
  ]
  return corners.flatMap(([r, start, end, square]) =>
    r > 0
      ? [
          { x: start[0], y: start[1], bulge: QUARTER_BULGE },
          { x: end[0], y: end[1], bulge: 0 },
        ]
      : [{ x: square[0], y: square[1], bulge: 0 }],
  )
}

/** A line of text centred on (x, y). */
function label(x: number, y: number, height: number, value: string): string[] {
  // 72 = 1 / 73 = 2: centred both ways on the alignment point (11, 21).
  return pairs(0, 'TEXT', 8, 'LABELS', 10, num(x), 20, num(y), 30, 0, 40, num(height), 1, text(value),
    72, 1, 73, 2, 11, num(x), 21, num(y), 31, 0)
}

/** One sheet's layout as the text of a DXF file. */
export function sheetDxf(sheet: SheetLayout): string {
  // The cutlist measures from the sheet's top-left with Y down; flip Y.
  const flip = (y: number, h: number) => sheet.width - y - h

  const entities = [
    ...polyline('SHEET', outline(0, 0, sheet.length, sheet.width)),
    ...sheet.placements.flatMap((p) => {
      const y = flip(p.y, p.h)
      // Big enough to read on a large part, never more than fits a thin one.
      const height = Math.min(25, Math.max(4, Math.min(p.w, p.h) / 8))
      return [
        ...polyline('PARTS', outline(p.x, y, p.w, p.h, p.corners)),
        ...label(p.x + p.w / 2, y + p.h / 2, height, `${p.name} ${num(p.w)} x ${num(p.h)}`),
      ]
    }),
  ]

  return [
    ...pairs(0, 'SECTION', 2, 'HEADER'),
    ...pairs(9, '$ACADVER', 1, 'AC1009'),
    ...pairs(9, '$INSUNITS', 70, 4), // millimetres
    ...pairs(9, '$MEASUREMENT', 70, 1), // metric
    ...pairs(9, '$EXTMIN', 10, 0, 20, 0, 30, 0),
    ...pairs(9, '$EXTMAX', 10, num(sheet.length), 20, num(sheet.width), 30, 0),
    ...pairs(0, 'ENDSEC'),
    ...pairs(0, 'SECTION', 2, 'TABLES'),
    ...pairs(0, 'TABLE', 2, 'LTYPE', 70, 1),
    ...pairs(0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0),
    ...pairs(0, 'ENDTAB'),
    ...pairs(0, 'TABLE', 2, 'LAYER', 70, LAYERS.length),
    ...LAYERS.flatMap((l) => pairs(0, 'LAYER', 2, l.name, 70, 0, 62, l.color, 6, 'CONTINUOUS')),
    ...pairs(0, 'ENDTAB'),
    ...pairs(0, 'ENDSEC'),
    ...pairs(0, 'SECTION', 2, 'ENTITIES'),
    ...entities,
    ...pairs(0, 'ENDSEC'),
    ...pairs(0, 'EOF'),
  ].join('\n') + '\n'
}

/** The file name for every sheet's DXF together, zipped. */
export const allSheetsZipFilename = (project: string) => `${slugify(project) || 'panelizer'}-dxf.zip`

/** File name for one sheet: project, material and thickness, sheet number. */
export function sheetDxfFilename(project: string, group: StockGroup, sheet: SheetLayout): string {
  const parts = [slugify(project) || 'panelizer', slugify(group.materialName), `${num(group.thickness)}mm`]
  return `${parts.filter(Boolean).join('-')}-sheet-${sheet.index}.dxf`
}
