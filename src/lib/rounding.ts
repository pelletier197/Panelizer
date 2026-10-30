import type { Panel } from '../types/panel'

/**
 * Rounded corners on a panel's face.
 *
 * A panel's face is a `length` × `width` rectangle. Its corners are numbered in
 * the face's own frame — `u` runs along the length, `v` along the width, both
 * pointing the way their world axes do — so a radius stays attached to the
 * same physical corner whichever way the panel faces:
 *
 *   3 (−u, +v) ───── 2 (+u, +v)
 *      │                 │
 *   0 (−u, −v) ───── 1 (+u, −v)
 *
 * Rounding never changes the panel's outer rectangle, so bounds, snapping,
 * overlaps and the cutlist packing all keep working on the box.
 */
export type CornerRadii = [number, number, number, number]

/** Each corner's (u, v) sign, in corner order. */
export const CORNER_SIGNS: readonly [number, number][] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]

const SQUARE: CornerRadii = [0, 0, 0, 0]

/**
 * The radii as drawn: each at least 0 and at most half the face's shorter
 * side. That cap also keeps two corners sharing an edge from overlapping, so a
 * radius left over from before a panel was shrunk simply draws as large as it
 * can.
 */
export function cornerRadii(panel: Pick<Panel, 'length' | 'width' | 'corners'>): CornerRadii {
  const cap = Math.min(panel.length, panel.width) / 2
  return (panel.corners ?? SQUARE).map((r) => Math.min(Math.max(0, r), cap)) as CornerRadii
}

export const hasRounding = (panel: Pick<Panel, 'length' | 'width' | 'corners'>): boolean =>
  cornerRadii(panel).some((r) => r > 0)

/**
 * The face outline as a polygon in the (u, v) frame, centred on the origin and
 * counter-clockwise, each rounded corner approximated by `segments` straight
 * pieces. A square corner contributes a single point.
 */
export function roundedOutline(length: number, width: number, radii: CornerRadii, segments = 8): [number, number][] {
  const hu = length / 2
  const hv = width / 2
  const points: [number, number][] = []
  // Corner 0 sweeps 180°→270°, 1 sweeps 270°→360°, and so on round.
  radii.forEach((r, i) => {
    const [su, sv] = CORNER_SIGNS[i]
    const cu = su * (hu - r)
    const cv = sv * (hv - r)
    if (r <= 0) {
      points.push([su * hu, sv * hv])
      return
    }
    const start = Math.PI + (i * Math.PI) / 2
    for (let s = 0; s <= segments; s++) {
      const a = start + (s / segments) * (Math.PI / 2)
      points.push([cu + r * Math.cos(a), cv + r * Math.sin(a)])
    }
  })
  return points
}

/**
 * An SVG path for a rectangle with its own radius per corner, given as
 * [top-left, top-right, bottom-right, bottom-left] in screen order (y down).
 */
export function roundedRectPath(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: CornerRadii): string {
  return [
    `M${x + tl},${y}`,
    `H${x + w - tr}`,
    tr ? `A${tr},${tr} 0 0 1 ${x + w},${y + tr}` : '',
    `V${y + h - br}`,
    br ? `A${br},${br} 0 0 1 ${x + w - br},${y + h}` : '',
    `H${x + bl}`,
    bl ? `A${bl},${bl} 0 0 1 ${x},${y + h - bl}` : '',
    `V${y + tl}`,
    tl ? `A${tl},${tl} 0 0 1 ${x + tl},${y}` : '',
    'Z',
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * A part's radii as it lies on the cutlist sheet, in screen order
 * [top-left, top-right, bottom-right, bottom-left]. Unturned, the length runs
 * along the sheet's X: corner 0 is top-left. Turned, the part is rotated a
 * true quarter turn (not mirrored), which moves every corner one place round.
 */
export function sheetCornerRadii(panel: Pick<Panel, 'length' | 'width' | 'corners'>, rotated: boolean): CornerRadii {
  const [r0, r1, r2, r3] = cornerRadii(panel)
  return rotated ? [r1, r2, r3, r0] : [r0, r1, r2, r3]
}

/** Corner orders that describe the same physical part: a board can be turned
 *  end for end or flipped over, so these rearrangements are all one part. */
const SAME_PART: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 2, 3], // as is
  [2, 3, 0, 1], // turned end for end
  [1, 0, 3, 2], // flipped along its width
  [3, 2, 1, 0], // flipped along its length
]
/** A square face also matches itself turned a quarter, and flipped across a
 *  diagonal. */
const SAME_SQUARE_PART: readonly (readonly [number, number, number, number])[] = [
  ...SAME_PART,
  [1, 2, 3, 0],
  [3, 0, 1, 2],
  [0, 3, 2, 1],
  [2, 1, 0, 3],
]

/**
 * A key that is equal for any two arrangements of the same physical part, for
 * grouping the parts list: the smallest of the radii's equivalent orders.
 * `radii` must already be in the frame the part is compared in (see
 * `buildParts`, which puts the longer side first).
 */
export function cornerKey(radii: CornerRadii, square: boolean): string {
  if (radii.every((r) => r === 0)) return ''
  return (square ? SAME_SQUARE_PART : SAME_PART)
    .map((order) => order.map((i) => radii[i]).join('/'))
    .sort()[0]
}

/**
 * An SVG path marking the square corners a rounding removes: at each rounded
 * corner, two legs along the edges, each as long as its radius, meeting where
 * the square corner was. Square corners and straight edges add nothing.
 * Radii in screen order [top-left, top-right, bottom-right, bottom-left].
 * Empty when nothing is rounded.
 */
export function squaredCornersPath(x: number, y: number, w: number, h: number, [tl, tr, br, bl]: CornerRadii): string {
  const legs: string[] = []
  if (tl) legs.push(`M${x},${y + tl} V${y} H${x + tl}`)
  if (tr) legs.push(`M${x + w - tr},${y} H${x + w} V${y + tr}`)
  if (br) legs.push(`M${x + w},${y + h - br} V${y + h} H${x + w - br}`)
  if (bl) legs.push(`M${x + bl},${y + h} H${x} V${y + h - bl}`)
  return legs.join(' ')
}
