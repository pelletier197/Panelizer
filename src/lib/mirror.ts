import type { Panel } from '../types/panel'
import { axisField } from './geometry'
import { unionBounds } from './framing'
import { CORNER_SIGNS } from './rounding'

type AxisIndex = 0 | 1 | 2

/**
 * A panel reflected through the plane `axis = plane` (world mm). Panels are
 * axis-aligned boxes, so a reflection only moves the centre: the box keeps its
 * size, normal and grain. What does change is anything that has a side:
 * rounded corners swap across the face, and a lap's half flips to the other
 * side of the joint, so a mirrored lap still meets its mirrored partner.
 */
export function mirrorPanel(panel: Panel, axis: AxisIndex, plane: number): Panel {
  const position: [number, number, number] = [...panel.position]
  position[axis] = 2 * plane - position[axis]
  const out: Panel = { ...panel, position }

  if (panel.corners) {
    const field = axisField(panel.normal, axis)
    if (field !== 'thickness') {
      const flip = (i: number): number => {
        const [su, sv] = CORNER_SIGNS[i]
        const [nu, nv] = field === 'length' ? [-su, sv] : [su, -sv]
        return CORNER_SIGNS.findIndex(([u, v]) => u === nu && v === nv)
      }
      const corners: [number, number, number, number] = [0, 0, 0, 0]
      panel.corners.forEach((r, i) => (corners[flip(i)] = r))
      out.corners = corners
    }
  }

  if (panel.cuts?.some((c) => c.half?.axis === axis)) {
    out.cuts = panel.cuts.map((c) =>
      c.half?.axis === axis ? { ...c, half: { axis, side: (-c.half.side) as 1 | -1 } } : c,
    )
  }

  return out
}

/**
 * Mirrored copies of `panels`, reflected through the face of their combined
 * box on `side` (−1 low, +1 high) of world `axis`, so the copies land right
 * against the originals like the other half of a symmetric piece. Ids are
 * kept; the caller gives the copies new ones.
 */
export function mirroredCopies(panels: Panel[], axis: AxisIndex, side: 1 | -1): Panel[] {
  const bounds = unionBounds(panels)
  if (!bounds) return []
  const plane = side > 0 ? bounds.max[axis] : bounds.min[axis]
  return panels.map((p) => mirrorPanel(p, axis, plane))
}
