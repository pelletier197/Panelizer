import type { Axis, Panel } from '../types/panel'
import { axisField, panelBoxSize } from './geometry'
import { unionBounds } from './framing'
import type { PanelPatch } from './resize'
import { CORNER_SIGNS } from './rounding'

type Vec3 = [number, number, number]
type AxisIndex = 0 | 1 | 2

const AXES: Axis[] = ['x', 'y', 'z']

/** The two world axes a quarter turn about `axis` swaps, in right-hand order:
 *  a +90° turn takes the first onto the second. */
const PLANE: Record<AxisIndex, [AxisIndex, AxisIndex]> = {
  0: [1, 2], // about X: Y → Z
  1: [2, 0], // about Y: Z → X
  2: [0, 1], // about Z: X → Y
}

/** Where a world axis ends up after a quarter turn about `about`: the turning
 *  axis stays put, the other two trade places. (Direction doesn't matter for
 *  an axis line — only for positions.) */
function turnAxis(axis: AxisIndex, about: AxisIndex): AxisIndex {
  const [a, b] = PLANE[about]
  return axis === a ? b : axis === b ? a : axis
}

/** A point turned a quarter turn about a line through `pivot` parallel to
 *  `about`. `dir` 1 is counter-clockwise looking down the axis from +, −1 the
 *  other way. */
function turnPoint(p: Vec3, pivot: Vec3, about: AxisIndex, dir: 1 | -1): Vec3 {
  const [a, b] = PLANE[about]
  const out: Vec3 = [...p]
  const da = p[a] - pivot[a]
  const db = p[b] - pivot[b]
  // +90°: (a, b) → (−b, a); −90°: (a, b) → (b, −a)
  out[a] = pivot[a] - dir * db
  out[b] = pivot[b] + dir * da
  return out
}

/** The world axis (0 / 1 / 2) a face dimension runs along for a given normal. */
const axisOf = (normal: Axis, field: 'length' | 'width'): AxisIndex =>
  ([0, 1, 2] as AxisIndex[]).find((a) => axisField(normal, a) === field)!

/**
 * A panel's corner radii after a quarter turn, so each radius stays on the
 * same physical corner. Each corner's direction from the centre is taken into
 * world space, turned, and read back in the turned panel's face frame.
 */
function turnCorners(
  panel: Panel,
  newNormal: Axis,
  about: AxisIndex,
  dir: 1 | -1,
): [number, number, number, number] {
  const radii = panel.corners!
  const turned: [number, number, number, number] = [0, 0, 0, 0]
  CORNER_SIGNS.forEach(([su, sv], i) => {
    const world: Vec3 = [0, 0, 0]
    world[axisOf(panel.normal, 'length')] = su
    world[axisOf(panel.normal, 'width')] = sv
    const after = turnPoint(world, [0, 0, 0], about, dir)
    const nu = Math.sign(after[axisOf(newNormal, 'length')])
    const nv = Math.sign(after[axisOf(newNormal, 'width')])
    turned[CORNER_SIGNS.findIndex(([u, v]) => u === nu && v === nv)] = radii[i]
  })
  return turned
}

/**
 * Turn panels a quarter turn about a world axis, as one rigid group pivoting on
 * the centre of their combined bounding box (a single panel turns in place).
 *
 * Panels are axis-aligned boxes, so a quarter turn is a pure permutation: the
 * box's extents along the two axes in the turning plane trade places, the
 * thickness axis (`normal`) follows the same swap, and length / width are
 * re-read from the new box. Grain is face-relative (`length` | `width`), so it
 * is re-derived from the world direction the grain physically ran along —
 * turning a shelf in its own plane swaps length and width and the grain label
 * with them, so the wood itself doesn't change direction.
 */
export function rotatePanels(panels: Panel[], about: AxisIndex, dir: 1 | -1): PanelPatch[] {
  const bounds = unionBounds(panels)
  if (!bounds) return []
  const pivot = [0, 1, 2].map((a) => (bounds.min[a] + bounds.max[a]) / 2) as Vec3

  return panels.map((panel) => {
    const size = panelBoxSize(panel)
    const normalIndex = AXES.indexOf(panel.normal) as AxisIndex
    const normal = AXES[turnAxis(normalIndex, about)]

    // The box after the turn: extents along the turning plane swap.
    const turned: Vec3 = [0, 0, 0]
    for (const a of [0, 1, 2] as AxisIndex[]) turned[turnAxis(a, about)] = size[a]

    const patch: Partial<Panel> = { normal, position: turnPoint(panel.position, pivot, about, dir) }
    for (const a of [0, 1, 2] as AxisIndex[]) {
      const field = axisField(normal, a)
      if (field !== 'thickness') patch[field] = turned[a]
    }

    if (panel.corners) patch.corners = turnCorners(panel, normal, about, dir)

    if (panel.grain !== 'none') {
      const grainAxis = ([0, 1, 2] as AxisIndex[]).find((a) => axisField(panel.normal, a) === panel.grain)!
      patch.grain = axisField(normal, turnAxis(grainAxis, about)) as 'length' | 'width'
    }

    return { id: panel.id, patch }
  })
}
