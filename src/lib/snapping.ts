import type { Panel } from '../types/panel'
import { panelBoxSize } from './geometry'

/** How close (mm) a panel must be to a snap target before it magnetically
 *  jumps to it while dragging. */
export const SNAP_THRESHOLD_MM = 15

/** Axis-aligned bounding box of a panel, in millimetres. */
export interface Bounds {
  min: [number, number, number]
  max: [number, number, number]
}

export function panelBounds(panel: Panel, position = panel.position): Bounds {
  const size = panelBoxSize(panel)
  return {
    min: [0, 1, 2].map((i) => position[i] - size[i] / 2) as [number, number, number],
    max: [0, 1, 2].map((i) => position[i] + size[i] / 2) as [number, number, number],
  }
}

/**
 * Snap a whole group of panels as one rigid body. Each axis is considered
 * independently: across every group member we look for the single closest
 * snap relationship to a non-group neighbour (the same alignment/contact
 * rules as {@link snapPosition}), and return the correction that lands that
 * one member on its target. Applied to the group's raw drag delta, this lets
 * *any* member's edge pull the whole formation — not just the dragged one.
 *
 * `members` carries each panel plus its *proposed* centre (raw delta already
 * applied). Returns a per-axis correction to add on top of the raw delta;
 * axes with no nearby target get 0.
 */
export function snapGroupDelta(
  members: { panel: Panel; position: [number, number, number] }[],
  others: Panel[],
  threshold: number,
): [number, number, number] {
  const neighbours = others.map((p) => panelBounds(p))
  const correction: [number, number, number] = [0, 0, 0]

  for (let axis = 0; axis < 3; axis++) {
    let best = 0
    let bestDistance = threshold // only targets strictly within threshold win
    for (const m of members) {
      const half = panelBoxSize(m.panel)[axis] / 2
      const centre = m.position[axis]
      const min = centre - half
      const max = centre + half
      for (const n of neighbours) {
        const nMin = n.min[axis]
        const nMax = n.max[axis]
        const nCentre = (nMin + nMax) / 2
        // [correction that lands the member on the target, distance to it]
        const candidates: [number, number][] = [
          [nCentre - centre, Math.abs(centre - nCentre)], // centre ↔ centre
          [nMin - min, Math.abs(min - nMin)], // min ↔ min
          [nMax - max, Math.abs(max - nMax)], // max ↔ max
          [nMax - min, Math.abs(min - nMax)], // contact: our min meets their max
          [nMin - max, Math.abs(max - nMin)], // contact: our max meets their min
        ]
        for (const [corr, distance] of candidates) {
          if (distance <= bestDistance) {
            bestDistance = distance
            best = corr
          }
        }
      }
    }
    correction[axis] = best
  }

  return correction
}

/**
 * While resizing, magnetically snap the moving face onto a nearby neighbour
 * edge on the same axis.
 *
 * `rawDelta` is the pointer's raw face displacement (mm). We turn it into the
 * face's would-be world coordinate, look for the closest neighbour edge
 * (their min/max bound on this axis) within `threshold`, and if one is close
 * enough return the delta that lands the face exactly on it. Otherwise the
 * raw delta passes through untouched.
 */
export function snapResizeFace(
  panel: Panel,
  axis: number,
  faceSign: 1 | -1,
  rawDelta: number,
  others: Panel[],
  threshold: number,
): number {
  const half = panelBoxSize(panel)[axis] / 2
  const faceStart = panel.position[axis] + faceSign * half
  const faceNow = faceStart + rawDelta

  let best = rawDelta
  let bestDistance = threshold
  for (const other of others) {
    const b = panelBounds(other)
    for (const edge of [b.min[axis], b.max[axis]]) {
      const distance = Math.abs(faceNow - edge)
      if (distance < bestDistance) {
        bestDistance = distance
        best = edge - faceStart
      }
    }
  }
  return best
}
