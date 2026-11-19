import type { Cut, Panel } from '../types/panel'
import { JOINT_TOL, panelBounds, type Bounds } from './bounds'
import { unionBounds } from './framing'
import { cutsBy, cutsWithout, intersectBounds } from './cuts'
import type { PanelPatch } from './resize'

type AxisIndex = 0 | 1 | 2
type Vec3 = [number, number, number]
type Half = NonNullable<Cut['half']>

/**
 * How two panels that share space are joined:
 * - `butt`: no cut; the overlap shows as a joint marker.
 * - `aIntoB` / `bIntoA`: one goes into the other, which gets a dado,
 *   groove or rabbet the shape of it.
 * - `lap`: each gives up half of where they meet (`half` is the half the
 *   one with the half cut loses; the other takes whatever is left).
 * - `custom`: cuts that match none of these, made some other way.
 */
export type JointKind = 'butt' | 'aIntoB' | 'bIntoA' | 'lap' | 'custom'

export interface Joint {
  kind: JointKind
  /** For a lap: the half cut, and which panel it's on. */
  half?: Half
  halfOn?: 'a' | 'b'
}

const extent = (b: Bounds, k: number) => b.max[k] - b.min[k]

/** Where two panels share real volume (deeper than a rounding sliver on every
 *  axis), or null. */
export function sharedBox(a: Panel, b: Panel): Bounds | null {
  const shared = intersectBounds(panelBounds(a), panelBounds(b))
  return shared && [0, 1, 2].every((k) => extent(shared, k) >= JOINT_TOL) ? shared : null
}

/** Read the joint between two panels back from their cuts. */
export function readJoint(a: Panel, b: Panel): Joint {
  const onA = cutsBy(a, b)
  const onB = cutsBy(b, a)
  if (onA.length === 0 && onB.length === 0) return { kind: 'butt' }
  if (onA.length === 0 && onB.length === 1 && !onB[0].half) return { kind: 'aIntoB' }
  if (onB.length === 0 && onA.length === 1 && !onA[0].half) return { kind: 'bIntoA' }
  if (onA.length === 1 && onB.length === 1) {
    if (onA[0].half) return { kind: 'lap', half: onA[0].half, halfOn: 'a' }
    if (onB[0].half) return { kind: 'lap', half: onB[0].half, halfOn: 'b' }
  }
  return { kind: 'custom' }
}

/**
 * The axis to split a lap along: one where the joint goes right through both
 * panels (each is no bigger than the overlap that way), so each keeps a full
 * half — the height of two crossing posts, or of two slotted dividers. Of
 * those, the longest; ties go to the vertical, then depth. With none that
 * fit, the overlap's longest axis.
 */
export function lapAxis(a: Panel, b: Panel): AxisIndex {
  const ba = panelBounds(a)
  const bb = panelBounds(b)
  const shared = intersectBounds(ba, bb)
  if (!shared) return 1
  const fits = (k: AxisIndex) =>
    Math.abs(extent(ba, k) - extent(shared, k)) < JOINT_TOL && Math.abs(extent(bb, k) - extent(shared, k)) < JOINT_TOL
  const order: AxisIndex[] = [1, 2, 0]
  const fitting = order.filter(fits)
  return (fitting.length > 0 ? fitting : order).reduce((best, k) =>
    extent(shared, k) > extent(shared, best) + JOINT_TOL ? k : best,
  )
}

/**
 * The half panel `a` gives up in a lap with `b` along `axis`: the half facing
 * the middle of `around` (the panels being joined), so in a corner the outer
 * faces stay whole. Dead centre — two posts crossing — `a` keeps the top
 * (or front, or right) and loses the other half.
 */
export function lapHalf(a: Panel, b: Panel, axis: AxisIndex, around: Panel[] = [a, b]): Half {
  const shared = intersectBounds(panelBounds(a), panelBounds(b))
  const all = unionBounds(around)
  if (!shared || !all) return { axis, side: -1 }
  const mid = (shared.min[axis] + shared.max[axis]) / 2
  const centre = (all.min[axis] + all.max[axis]) / 2
  return { axis, side: centre > mid + JOINT_TOL ? 1 : -1 }
}

/**
 * Patches that set the joint between `a` and `b`, leaving their joints with
 * other panels alone. A lap puts the half cut on `a` and has `b` take the
 * rest of `a` — the same as two half cuts on its own, and still right when
 * `a` is cut by something else too.
 */
export function setJoint(a: Panel, b: Panel, kind: Exclude<JointKind, 'custom'>, half?: Half): PanelPatch[] {
  let onA = cutsWithout(a, b)
  let onB = cutsWithout(b, a)
  if (kind === 'aIntoB') onB = [...onB, { by: a.id }]
  if (kind === 'bIntoA') onA = [...onA, { by: b.id }]
  if (kind === 'lap') {
    onA = [...onA, { by: b.id, half: half ?? lapHalf(a, b, lapAxis(a, b)) }]
    onB = [...onB, { by: a.id }]
  }
  return [
    { id: a.id, patch: { cuts: onA.length > 0 ? onA : undefined } },
    { id: b.id, patch: { cuts: onB.length > 0 ? onB : undefined } },
  ]
}

/**
 * A lap's half changed — flipped, or turned to another axis — wherever it
 * lives between the two panels.
 */
export function setLapHalf(a: Panel, b: Panel, half: Half): PanelPatch[] {
  const joint = readJoint(a, b)
  if (joint.kind !== 'lap') return setJoint(a, b, 'lap', half)
  const [host, by] = joint.halfOn === 'a' ? [a, b] : [b, a]
  const cuts = (host.cuts ?? []).map((c) => (c.by === by.id && c.half ? { ...c, half } : c))
  return [{ id: host.id, patch: { cuts } }]
}

/** Whether three panels all share space with each other — a 3-way joint. */
export const isThreeWay = ([a, b, c]: Panel[]): boolean =>
  sharedBox(a, b) !== null && sharedBox(a, c) !== null && sharedBox(b, c) !== null

/** The panel of three that runs up and down, which a 3-way corner usually
 *  keeps a quarter of; else the first. */
export function defaultPost(panels: Panel[]): Panel {
  const upright = panels.find((p) => {
    const b = panelBounds(p)
    return extent(b, 1) > extent(b, 0) && extent(b, 1) > extent(b, 2)
  })
  return upright ?? panels[0]
}

/**
 * A 3-way corner, like a table frame's leg and two rails: `post` gives up
 * half to each rail — one half each way, so a quarter of it runs through —
 * the two rails lap each other, and each rail takes what the post left. The
 * three pieces fill the corner with nothing missing and nothing doubled.
 */
export function setThreeWay(post: Panel, rails: [Panel, Panel]): PanelPatch[] {
  const [r1, r2] = rails
  const around = [post, r1, r2]
  const postCuts = [
    ...(post.cuts ?? []).filter((c) => c.by !== r1.id && c.by !== r2.id),
    { by: r1.id, half: lapHalf(post, r1, lapAxis(post, r1), around) },
    { by: r2.id, half: lapHalf(post, r2, lapAxis(post, r2), around) },
  ]
  const r1Cuts = [
    ...(r1.cuts ?? []).filter((c) => c.by !== post.id && c.by !== r2.id),
    { by: post.id },
    { by: r2.id, half: lapHalf(r1, r2, lapAxis(r1, r2), around) },
  ]
  const r2Cuts = [
    ...(r2.cuts ?? []).filter((c) => c.by !== post.id && c.by !== r1.id),
    { by: post.id },
    { by: r1.id },
  ]
  return [
    { id: post.id, patch: { cuts: postCuts } },
    { id: r1.id, patch: { cuts: r1Cuts } },
    { id: r2.id, patch: { cuts: r2Cuts } },
  ]
}

/**
 * How far to pull each panel of a joint away from it so its pieces can be
 * seen apart (mm, per panel id): out from the joint, towards the side where
 * each one keeps its wood near the joint — the top half of a lap goes up, a
 * shelf comes out of its dado, a post drops away from the rails it held. The
 * gap grows with the joint, so small joints and big ones both read.
 */
export function explodeOffsets(panels: Panel[], ids: string[], solids: Map<string, Bounds[]>): Map<string, Vec3> {
  const parts = ids.map((id) => panels.find((p) => p.id === id)).filter((p): p is Panel => p !== undefined)
  const shared = parts.flatMap((a, i) =>
    parts.slice(i + 1).flatMap((b) => {
      const box = intersectBounds(panelBounds(a), panelBounds(b))
      return box ? [box] : []
    }),
  )
  const offsets = new Map<string, Vec3>()
  if (shared.length === 0) return offsets

  const joint: Bounds = {
    min: [0, 1, 2].map((k) => Math.min(...shared.map((b) => b.min[k]))) as Vec3,
    max: [0, 1, 2].map((k) => Math.max(...shared.map((b) => b.max[k]))) as Vec3,
  }
  const size = Math.max(...[0, 1, 2].map((k) => extent(joint, k)))
  const centre = [0, 1, 2].map((k) => (joint.min[k] + joint.max[k]) / 2)
  // Near the joint: the joint box grown by its own size every way.
  const near: Bounds = {
    min: joint.min.map((v) => v - size) as Vec3,
    max: joint.max.map((v) => v + size) as Vec3,
  }
  const gap = size * 0.75 + 10

  // Which way a panel's wood in `region` lies from the joint's centre, as a
  // unit vector, or zeros when it has none there or it's centred.
  const lean = (panel: Panel, region: Bounds) => {
    let volume = 0
    const sum = [0, 0, 0]
    for (const box of solids.get(panel.id) ?? [panelBounds(panel)]) {
      const piece = intersectBounds(box, region)
      if (!piece) continue
      const v = extent(piece, 0) * extent(piece, 1) * extent(piece, 2)
      volume += v
      for (const k of [0, 1, 2]) sum[k] += ((piece.min[k] + piece.max[k]) / 2) * v
    }
    const dir = volume > 0 ? sum.map((s, k) => s / volume - centre[k]) : [0, 0, 0]
    const length = Math.hypot(...dir)
    return length > 1e-6 ? dir.map((d) => d / length) : [0, 0, 0]
  }

  for (const panel of parts) {
    // Mostly the side it keeps inside the joint (the top half of a lap), then
    // the way it runs off from the joint (a shelf out of its dado).
    const inside = lean(panel, joint)
    const around = lean(panel, near)
    let dir = inside.map((d, k) => d + around[k] / 2)
    if (Math.hypot(...dir) < 1e-6) dir = panel.position.map((p, k) => p - centre[k])
    const length = Math.hypot(...dir)
    offsets.set(panel.id, length < 1e-6 ? [0, 0, 0] : (dir.map((d) => (d / length) * gap) as Vec3))
  }
  return offsets
}

/**
 * The post of a 3-way corner cut by `setThreeWay` — the panel cut by half of
 * each of the other two, which take the rest of it — or null when the three
 * aren't cut as a corner.
 */
export function readCorner(parts: Panel[]): Panel | null {
  if (parts.length !== 3) return null
  return (
    parts.find((post) => {
      const rails = parts.filter((p) => p !== post)
      return rails.every(
        (r) =>
          cutsBy(post, r).length === 1 && cutsBy(post, r)[0].half && cutsBy(r, post).some((c) => !c.half),
      )
    }) ?? null
  )
}

/**
 * Every part in the joint where `a` and `b` meet: the two of them and any
 * other visible part that runs into the same spot (into the wood `a` and `b`
 * share, and into each of them). Three posts meeting at a corner are one
 * joint of three parts, wherever it's opened from.
 */
export function jointGroup(panels: Panel[], a: Panel, b: Panel): Panel[] {
  const joint = sharedBox(a, b)
  if (!joint) return [a, b]
  const others = panels.filter(
    (c) =>
      c.id !== a.id &&
      c.id !== b.id &&
      !c.hidden &&
      sharedBox(a, c) !== null &&
      sharedBox(b, c) !== null &&
      intersectBounds(joint, panelBounds(c)) !== null,
  )
  return [a, b, ...others]
}

/** The pairs among `parts` that share space or are cut by one another: each
 *  a joint to choose. */
export function partPairs(parts: Panel[]): [Panel, Panel][] {
  const related = (a: Panel, b: Panel) =>
    sharedBox(a, b) !== null || cutsBy(a, b).length > 0 || cutsBy(b, a).length > 0
  return parts.flatMap((a, i) => parts.slice(i + 1).filter((b) => related(a, b)).map((b): [Panel, Panel] => [a, b]))
}

/** The joint between two panels in plain words, for a list of joints. */
export function describeJoint(a: Panel, b: Panel): string {
  const joint = readJoint(a, b)
  switch (joint.kind) {
    case 'butt':
      return 'Not cut: they overlap'
    case 'aIntoB':
      return `${b.name} is notched for ${a.name}`
    case 'bIntoA':
      return `${a.name} is notched for ${b.name}`
    case 'lap':
      return 'Split between them'
    default:
      return 'Custom cuts'
  }
}
