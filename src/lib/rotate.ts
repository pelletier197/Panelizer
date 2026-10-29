import type { Axis, Panel } from '../types/panel'
import { axisField, panelBoxSize } from './geometry'
import { unionBounds } from './framing'
import type { PanelPatch } from './resize'

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

    if (panel.grain !== 'none') {
      const grainAxis = ([0, 1, 2] as AxisIndex[]).find((a) => axisField(panel.normal, a) === panel.grain)!
      patch.grain = axisField(normal, turnAxis(grainAxis, about)) as 'length' | 'width'
    }

    return { id: panel.id, patch }
  })
}
