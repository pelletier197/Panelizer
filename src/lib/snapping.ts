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

/** Bounds tagged with the axis its thickness runs along (its smallest extent) —
 *  the only axis on which its centre line is a meaningful snap target. */
interface ThinBounds extends Bounds {
  thinAxis: 0 | 1 | 2
}

function withThinAxis(b: Bounds): ThinBounds {
  const ext = [0, 1, 2].map((i) => b.max[i] - b.min[i])
  const thinAxis = (ext.indexOf(Math.min(...ext)) as 0 | 1 | 2) ?? 0
  return { ...b, thinAxis }
}

/**
 * Whether a box (centre `position`, size `size`) overlaps the neighbour bounds
 * `n` on both axes *other* than `axis`. Contact (shared boundary) counts as
 * overlap; any gap does not. Used to gate snapping so a face only snaps where
 * the two panels genuinely meet, not where they merely share a coordinate while
 * sitting in different planes.
 */
function overlapsPerpendicular(
  position: [number, number, number],
  size: [number, number, number],
  n: Bounds,
  axis: number,
): boolean {
  for (let k = 0; k < 3; k++) {
    if (k === axis) continue
    const half = size[k] / 2
    if (position[k] + half < n.min[k] || position[k] - half > n.max[k]) return false
  }
  return true
}

/**
 * What kind of line on the target (neighbour) panel a drag snapped to, along a
 * single axis. Reported so the viewport can label the snap:
 *  - `butt`   — one of our faces lands on a neighbour face (whether the panels
 *               end up adjacent or overlapping — flush laps and butt joints are
 *               the same snap, not worth distinguishing and prone to flicker).
 *  - `middle` — our nearest face or centre lands on the neighbour's centre line;
 *               handy for roughing in a rabbet or dado.
 */
export type SnapKind = 'butt' | 'middle'

/** The winning snap on one axis: the correction (mm) to add to the raw delta,
 *  plus every target line that same correction lands on. When a panel goes flush
 *  with a neighbour both faces satisfy the *same* correction, so both are
 *  reported (and highlighted) at once instead of the guide flicking between
 *  them. */
/** One highlighted target: the snapped plane, its kind, and the *contact
 *  rectangle* — the axis-aligned overlap (mm) of the two panels. On the snap
 *  axis the overlap is degenerate; the viewport draws the guide from the other
 *  two axes so it marks only where the faces actually meet, not the whole face. */
export interface SnapHitTarget {
  plane: number
  kind: SnapKind
  lo: [number, number, number]
  hi: [number, number, number]
}

export interface AxisSnap {
  correction: number
  hits: SnapHitTarget[]
}

/** Result of {@link snapGroupDelta}: a per-axis correction plus, for each axis,
 *  the winning snap (or null when nothing was within threshold). */
export interface GroupSnap {
  correction: [number, number, number]
  snaps: [AxisSnap | null, AxisSnap | null, AxisSnap | null]
}

/** A live snap marker for the viewport: an active snap plane and where to draw
 *  it. `at` is a point on the plane near the moving panel; `size` is the moving
 *  panel's box size (mm) so the marker can be drawn to match. */
export interface SnapHint {
  axis: 0 | 1 | 2
  kind: SnapKind
  at: [number, number, number]
  size: [number, number, number]
  /** Whether to draw the text label. When several faces snap at once only the
   *  first carries a label so the words don't stack. Defaults to shown. */
  label?: boolean
}

/**
 * Snap a whole group of panels as one rigid body. Each axis is considered
 * independently: across every group member we look for the single closest
 * snap relationship to a non-group neighbour and return the correction that
 * lands that one member on its target. Applied to the group's raw drag delta,
 * this lets *any* member's edge pull the whole formation — not just the
 * dragged one.
 *
 * Relationships considered per axis: centre↔centre, flush face alignment
 * (min↔min, max↔max), face-to-face contact (butt joints), and — for roughing
 * in rabbets/dados — either face landing on the neighbour's centre line.
 *
 * `members` carries each panel plus its *proposed* centre (raw delta already
 * applied). Returns a per-axis correction to add on top of the raw delta (0 on
 * axes with no nearby target) plus the winning snap on each axis for display.
 */
export function snapGroupDelta(
  members: { panel: Panel; position: [number, number, number] }[],
  others: Panel[],
  threshold: number,
): GroupSnap {
  const neighbours = others.map((p) => withThinAxis(panelBounds(p)))
  const correction: [number, number, number] = [0, 0, 0]
  const snaps: [AxisSnap | null, AxisSnap | null, AxisSnap | null] = [null, null, null]

  for (let axis = 0; axis < 3; axis++) {
    // Candidates depend on whether our box already overlaps the neighbour on
    // this axis:
    //  - Overlapping → we're sliding *over* it, so offer edge-alignment (our
    //    min→their min, our max→their max) and centre-to-centre. For equal-size
    //    panels these all share ONE correction, so a flush fit lights up both
    //    faces and the centre together, dead stable. No contact/butt snap here —
    //    yanking an overlapping panel back to "just touching" is never wanted,
    //    and it was the source of the flush flicker.
    //  - Outside → offer the butt (our near face onto their near face).
    // Middle stays available while overlapping, so co-centring parallel faces
    // works. Nearest correction wins; every target sharing it is highlighted.
    const cands: (SnapHitTarget & { corr: number })[] = []

    for (const m of members) {
      const mSize = panelBoxSize(m.panel)
      const half = mSize[axis] / 2
      const centre = m.position[axis]
      const min = centre - half
      const max = centre + half
      for (const n of neighbours) {
        // Only snap this axis if the two panels actually overlap on the *other*
        // two axes — i.e. their faces could really meet here. Without this a
        // panel passing a distant block in a different plane would snap to it in
        // empty space, drawing an intersection guide where nothing touches.
        if (!overlapsPerpendicular(m.position, mSize, n, axis)) continue
        const nMin = n.min[axis]
        const nMax = n.max[axis]
        const nCentre = (nMin + nMax) / 2

        // The contact rectangle: where the two boxes overlap on every axis. The
        // guide is drawn from this (minus the snap axis) so it marks only the
        // patch where the faces meet, not the whole dragged face.
        const lo = [0, 1, 2].map((i) => Math.max(m.position[i] - mSize[i] / 2, n.min[i])) as [number, number, number]
        const hi = [0, 1, 2].map((i) => Math.min(m.position[i] + mSize[i] / 2, n.max[i])) as [number, number, number]
        const at = (corr: number, plane: number, kind: SnapKind) => cands.push({ corr, plane, kind, lo, hi })

        if (min < nMax && max > nMin) {
          at(nMin - min, nMin, 'butt') // align low edges
          at(nMax - max, nMax, 'butt') // align high edges
          // Only co-centre against a neighbour whose *thickness* runs along this
          // axis (its face is perpendicular to the drag): that centre is a real
          // mid-thickness reference. Skip panels that merely span the axis — the
          // centre of a shelf's width isn't something to snap to.
          if (axis === n.thinAxis) at(nCentre - centre, nCentre, 'middle')
        } else {
          at(nMax - min, nMax, 'butt') // our min butts their max
          at(nMin - max, nMin, 'butt') // our max butts their min
        }
      }
    }

    const win = cands.reduce<(typeof cands)[number] | null>(
      (best, c) =>
        Math.abs(c.corr) < threshold && (!best || Math.abs(c.corr) < Math.abs(best.corr)) ? c : best,
      null,
    )
    if (!win) continue

    // Highlight every target either sharing the winning correction (flush shows
    // both faces + centre together) OR one the panel is already essentially on
    // (so a part nestled between two neighbours lights up BOTH butts). Dedupe by
    // plane AND contact rectangle, so several panels meeting the SAME plane (e.g.
    // a side butting the ends of two rails + the bottom) each light up — a
    // plane-only key would collapse them into one.
    const CONTACT_TOL = 1.5
    const seen = new Set<string>()
    const hits: SnapHitTarget[] = []
    for (const c of cands) {
      if (Math.abs(c.corr) >= threshold) continue
      if (Math.abs(c.corr - win.corr) > 0.5 && Math.abs(c.corr) > CONTACT_TOL) continue
      const r = (v: number) => Math.round(v)
      const key = `${r(c.plane)}|${c.lo.map(r).join(',')}|${c.hi.map(r).join(',')}`
      if (seen.has(key)) continue
      seen.add(key)
      hits.push({ plane: c.plane, kind: c.kind, lo: c.lo, hi: c.hi })
    }

    correction[axis] = win.corr
    snaps[axis] = { correction: win.corr, hits }
  }

  return { correction, snaps }
}

/** Result of {@link snapResizeFace}: the (possibly snapped) face delta plus the
 *  winning target for display (with its contact rectangle), or null when nothing
 *  was within threshold. */
export interface FaceSnap {
  delta: number
  snap: SnapHitTarget | null
}

/**
 * While resizing, magnetically snap the moving face onto a nearby neighbour
 * line on the same axis — either of a neighbour's faces (`butt`) or its centre
 * line (`middle`, for roughing a rabbet/dado onto a fixed reference).
 *
 * `rawDelta` is the pointer's raw face displacement (mm). We turn it into the
 * face's would-be world coordinate, look for the closest target within
 * `threshold`, and if one is close enough return the delta that lands the face
 * exactly on it (plus the target for the guide). Otherwise the raw delta passes
 * through untouched with no snap.
 */
export function snapResizeFace(
  panel: Panel,
  axis: number,
  faceSign: 1 | -1,
  rawDelta: number,
  others: Panel[],
  threshold: number,
): FaceSnap {
  const size = panelBoxSize(panel)
  const half = size[axis] / 2
  const faceStart = panel.position[axis] + faceSign * half
  const faceNow = faceStart + rawDelta

  // Nearest target wins — a neighbour's two faces (`butt`) plus, for panels
  // whose thickness runs along this axis, their centre line (`middle`, a dado
  // reference). Faces and centre compete as peers so the centre snap actually
  // shows as the edge nears it (tiering hid it behind the ever-closer face).
  let best = threshold
  let winner: { delta: number; snap: SnapHitTarget } | null = null
  for (const other of others) {
    const b = withThinAxis(panelBounds(other))
    // Only snap to neighbours the resized face actually spans in-plane.
    if (!overlapsPerpendicular(panel.position, size, b, axis)) continue
    // Contact rectangle: the panel-vs-neighbour overlap, so the guide marks only
    // where they meet. On the resize axis it's pinned to the snapped plane below.
    const lo = [0, 1, 2].map((i) => Math.max(panel.position[i] - size[i] / 2, b.min[i])) as [number, number, number]
    const hi = [0, 1, 2].map((i) => Math.min(panel.position[i] + size[i] / 2, b.max[i])) as [number, number, number]
    const targets: [number, SnapKind][] = [
      [b.min[axis], 'butt'],
      [b.max[axis], 'butt'],
    ]
    if (axis === b.thinAxis) targets.push([(b.min[axis] + b.max[axis]) / 2, 'middle'])
    for (const [plane, kind] of targets) {
      const distance = Math.abs(faceNow - plane)
      if (distance >= best) continue
      best = distance
      winner = { delta: plane - faceStart, snap: { plane, kind, lo, hi } }
    }
  }
  return winner ?? { delta: rawDelta, snap: null }
}
