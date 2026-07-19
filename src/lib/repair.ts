import type { Panel } from '../types/panel'
import type { Unit } from './units'
import { panelBoxSize } from './geometry'

type Vec3 = [number, number, number]

/** Only joints already within this many mm are treated as "meant to touch" and
 *  welded shut. Bigger gaps (e.g. a 2-3 mm door/drawer reveal) are intentional
 *  space and left alone. Drift from rounding is well under a millimetre. */
const CONTACT_TOL = 1.5
/** Slack allowed when testing whether two panels overlap on the axes across from
 *  the joint (so a face flush to an edge still counts). */
const PERP_TOL = 0.5
/** Relaxation stops when the largest move in a pass drops below this (mm)… */
const SETTLE_MM = 1e-7
/** …or after this many passes (a safety cap; a consistent model settles in a
 *  handful of passes — the diameter of the joint graph). */
const MAX_PASSES = 1000

/** A welded joint: face `si` (−1 = low, +1 = high) of panel `i` on `axis` should
 *  sit exactly on face `sj` of panel `j`. */
interface Joint {
  i: number
  j: number
  axis: 0 | 1 | 2
  si: -1 | 1
  sj: -1 | 1
}

/**
 * Heal an imperial design that drifted while whole-millimetre / grid rounding
 * was in effect: snap every panel's thickness back onto the exact unit grid
 * (e.g. 19 mm → a true 3/4"), then close the hairline gaps at every joint so a
 * row of parts adds up exactly.
 *
 * Gap closing is a fixed-point relaxation. Joints (pairs of faces already within
 * {@link CONTACT_TOL}) are detected once. Each connected cluster is anchored at
 * its min-corner panel; a breadth-first pass assigns every panel a depth from
 * that anchor. Then we relax repeatedly — for each joint the panel *further* from
 * the anchor is moved onto the nearer one — until nothing moves. Because motion
 * only ever flows away from the fixed anchor, it converges (no oscillation) and
 * the anchor's corner stays put while the far end pulls in to close every gap.
 */
export function repairPrecision(panels: Panel[], unit: Unit): Panel[] {
  // 1) Nudge a thickness onto the exact unit grid ONLY if it's already a hair
  //    off one (e.g. legacy 19 mm → a true 3/4" = 19.05). A genuine metric
  //    thickness like 18 mm is NOT a clean inch fraction and must be left alone —
  //    snapping it to 11/16" would silently shrink the part.
  const grid = unit === 'inch' ? 25.4 / 16 : 1
  const snapThickness = (t: number) => {
    const snapped = Math.round(t / grid) * grid
    return Math.abs(snapped - t) <= 0.1 ? snapped : t
  }
  const fixed = panels.map((p) => ({ ...p, thickness: snapThickness(p.thickness) }))

  const pos: Vec3[] = fixed.map((p) => [...p.position] as Vec3)
  const half: Vec3[] = fixed.map((p) => {
    const s = panelBoxSize(p)
    return [s[0] / 2, s[1] / 2, s[2] / 2] as Vec3
  })
  const face = (idx: number, axis: number, sign: number) => pos[idx][axis] + sign * half[idx][axis]

  const perpOverlap = (i: number, j: number, axis: number): boolean => {
    for (let k = 0; k < 3; k++) {
      if (k === axis) continue
      if (face(i, k, 1) < face(j, k, -1) - PERP_TOL || face(i, k, -1) > face(j, k, 1) + PERP_TOL) return false
    }
    return true
  }

  // 2) Detect joints: for each pair + axis where the panels overlap across the
  //    joint, weld the closest face-pair if it's already within tolerance.
  const joints: Joint[] = []
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      for (let axis = 0; axis < 3; axis++) {
        if (!perpOverlap(i, j, axis)) continue
        let best = CONTACT_TOL
        let pick: Joint | null = null
        for (const si of [-1, 1] as const) {
          for (const sj of [-1, 1] as const) {
            const d = Math.abs(face(i, axis, si) - face(j, axis, sj))
            if (d <= best) {
              best = d
              pick = { i, j, axis: axis as 0 | 1 | 2, si, sj }
            }
          }
        }
        if (pick) joints.push(pick)
      }
    }
  }

  // 3) Anchor each connected cluster and assign a depth from it.
  const adj: number[][] = fixed.map(() => [])
  for (const c of joints) {
    adj[c.i].push(c.j)
    adj[c.j].push(c.i)
  }
  const depth = new Array<number>(fixed.length).fill(-1)
  const lower = (a: number, b: number) => {
    // lexicographic min-corner, to pick a stable anchor per cluster
    for (let k = 0; k < 3; k++) {
      const d = face(a, k, -1) - face(b, k, -1)
      if (Math.abs(d) > 1e-9) return d < 0
    }
    return a < b
  }
  for (let seed = 0; seed < fixed.length; seed++) {
    if (depth[seed] !== -1) continue
    const cluster: number[] = []
    const stack = [seed]
    depth[seed] = 0 // provisional "seen" marker; recomputed below
    while (stack.length) {
      const u = stack.pop()!
      cluster.push(u)
      for (const v of adj[u])
        if (depth[v] === -1) {
          depth[v] = 0
          stack.push(v)
        }
    }
    let anchor = cluster[0]
    for (const u of cluster) if (lower(u, anchor)) anchor = u
    for (const u of cluster) depth[u] = -1
    depth[anchor] = 0
    const queue = [anchor]
    while (queue.length) {
      const u = queue.shift()!
      for (const v of adj[u])
        if (depth[v] === -1) {
          depth[v] = depth[u] + 1
          queue.push(v)
        }
    }
  }
  // Deeper (or, at equal depth, higher-index) endpoint is the one that moves.
  const moves = (a: number, b: number) => depth[a] > depth[b] || (depth[a] === depth[b] && a > b)

  // 4) Relax until settled: pull each joint's deeper panel onto the nearer one.
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let worst = 0
    for (const c of joints) {
      const gap = face(c.i, c.axis, c.si) - face(c.j, c.axis, c.sj)
      if (Math.abs(gap) < 1e-12) continue
      if (moves(c.j, c.i)) pos[c.j][c.axis] += gap // move j so its face meets i's
      else pos[c.i][c.axis] -= gap // move i so its face meets j's
      worst = Math.max(worst, Math.abs(gap))
    }
    if (worst < SETTLE_MM) break
  }

  return fixed.map((p, i) => ({ ...p, position: pos[i] }))
}
