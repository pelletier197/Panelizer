import type { Panel } from '../types/panel'
import { JOINT_TOL, contactRect, panelBounds } from './bounds'
import { cutsBy, solidsOf } from './cuts'
import { sharedBox } from './joints'

/** A box (mm) where two panels occupy the same space. */
export interface OverlapBox {
  center: [number, number, number]
  size: [number, number, number]
}

/**
 * Every region where two panels interpenetrate. This is purely informational —
 * an overlap marks where a real joint lives (a butt is the default; a miter or
 * dovetail is up to the builder). The app only tracks panel length, so the
 * highlight is a visual cue, not an error.
 *
 * Interpenetration shallower than {@link JOINT_TOL} is ignored: a butt joint
 * that rounds a hair past flush leaves a sliver that isn't a real overlap.
 *
 * Joints that are cut (see `lib/cuts.ts`) don't show: the overlap is taken
 * between the wood each panel has left, so a dado or a lap leaves nothing.
 */
export function overlapBoxes(panels: Panel[]): OverlapBox[] {
  const bounds = panels.map((p) => panelBounds(p))
  const solids = solidsOf(panels)
  const boxes: OverlapBox[] = []

  const add = (lo: number[], hi: number[]) => {
    if ([0, 1, 2].some((axis) => hi[axis] - lo[axis] < JOINT_TOL)) return
    boxes.push({
      center: [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2) as [number, number, number],
      size: [0, 1, 2].map((a) => hi[a] - lo[a]) as [number, number, number],
    })
  }

  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const { lo, hi } = contactRect(bounds[i], bounds[j])
      if ([0, 1, 2].some((axis) => hi[axis] - lo[axis] < JOINT_TOL)) continue
      if (!panels[i].cuts && !panels[j].cuts) {
        add(lo, hi)
        continue
      }
      for (const a of solids.get(panels[i].id) ?? []) {
        for (const b of solids.get(panels[j].id) ?? []) {
          const shared = contactRect(a, b)
          add(shared.lo, shared.hi)
        }
      }
    }
  }

  return boxes
}

/** Where two panels meet, for the viewport's joint markers: the box they
 *  share, and whether the joint has been cut. */
export interface JointMarker {
  a: string
  b: string
  cut: boolean
  center: [number, number, number]
  size: [number, number, number]
}

/**
 * One marker per place visible panels share space: every place a joint can
 * be chosen. A pair cut by one another is marked `cut`; a pair whose overlap
 * was cut away by something else entirely leaves no marker.
 */
export function jointMarkers(panels: Panel[]): JointMarker[] {
  const shown = panels.filter((p) => !p.hidden)
  const solids = solidsOf(panels)
  const markers: JointMarker[] = []
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const [a, b] = [shown[i], shown[j]]
      const shared = sharedBox(a, b)
      if (!shared) continue
      const cut = cutsBy(a, b).length > 0 || cutsBy(b, a).length > 0
      if (!cut) {
        const left = (solids.get(a.id) ?? []).some((x) =>
          (solids.get(b.id) ?? []).some((y) => {
            const { lo, hi } = contactRect(x, y)
            return [0, 1, 2].every((k) => hi[k] - lo[k] >= JOINT_TOL)
          }),
        )
        if (!left) continue
      }
      const center = [0, 1, 2].map((k) => (shared.min[k] + shared.max[k]) / 2) as [number, number, number]
      const size = [0, 1, 2].map((k) => shared.max[k] - shared.min[k]) as [number, number, number]
      // Pairs meeting in the very same spot (three posts at a corner) are one
      // joint: one marker, still uncut while any of them is.
      const same = markers.find((m) =>
        [0, 1, 2].every((k) => Math.abs(m.center[k] - center[k]) < JOINT_TOL && Math.abs(m.size[k] - size[k]) < JOINT_TOL),
      )
      if (same) same.cut &&= cut
      else markers.push({ a: a.id, b: b.id, cut, center, size })
    }
  }
  return markers
}
