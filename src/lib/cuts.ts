import type { Cut, Panel } from '../types/panel'
import { panelBounds, type Bounds } from './bounds'

type Vec3 = [number, number, number]

/** Spans thinner than this (mm) are slivers of float noise, not wood. */
const SLIVER = 1e-3

/** The box two boxes share, or null when they don't share any volume. */
export function intersectBounds(a: Bounds, b: Bounds): Bounds | null {
  const min = [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k])) as Vec3
  const max = [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k])) as Vec3
  return [0, 1, 2].every((k) => max[k] - min[k] > SLIVER) ? { min, max } : null
}

/** One half of a box: the half on `side` of its middle along `axis`. */
export function halfOf(box: Bounds, half: NonNullable<Cut['half']>): Bounds {
  const { axis, side } = half
  const mid = (box.min[axis] + box.max[axis]) / 2
  const min: Vec3 = [...box.min]
  const max: Vec3 = [...box.max]
  if (side > 0) min[axis] = mid
  else max[axis] = mid
  return { min, max }
}

/** Sorted, de-duplicated coordinates (values within a sliver are one line). */
function gridLines(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > SLIVER)
}

/**
 * What's left of `box` once `holes` are taken out, as a few boxes. The box is
 * diced along every hole face into cells, the cells that land in a hole are
 * dropped, and the rest are merged back greedily (runs along X, then rows
 * along Y, then slabs along Z), so a plain groove leaves three boxes, not
 * dozens.
 */
export function subtractBoxes(box: Bounds, holes: Bounds[]): Bounds[] {
  const cut = holes.map((h) => intersectBounds(box, h)).filter((h): h is Bounds => h !== null)
  if (cut.length === 0) return [box]

  const lines = ([0, 1, 2] as const).map((k) =>
    gridLines([box.min[k], box.max[k], ...cut.flatMap((h) => [h.min[k], h.max[k]])]).filter(
      (v) => v >= box.min[k] - SLIVER && v <= box.max[k] + SLIVER,
    ),
  )
  const [nx, ny, nz] = lines.map((l) => l.length - 1)
  const index = (i: number, j: number, k: number) => (k * ny + j) * nx + i
  const solid = new Array<boolean>(nx * ny * nz)
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = [
          (lines[0][i] + lines[0][i + 1]) / 2,
          (lines[1][j] + lines[1][j + 1]) / 2,
          (lines[2][k] + lines[2][k + 1]) / 2,
        ]
        solid[index(i, j, k)] = !cut.some((h) => [0, 1, 2].every((a) => c[a] > h.min[a] && c[a] < h.max[a]))
      }
    }
  }

  const taken = new Array<boolean>(solid.length).fill(false)
  const free = (i: number, j: number, k: number) => solid[index(i, j, k)] && !taken[index(i, j, k)]
  const out: Bounds[] = []
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!free(i, j, k)) continue
        let i1 = i + 1
        while (i1 < nx && free(i1, j, k)) i1++
        const rowFree = (jj: number, kk: number) => {
          for (let ii = i; ii < i1; ii++) if (!free(ii, jj, kk)) return false
          return true
        }
        let j1 = j + 1
        while (j1 < ny && rowFree(j1, k)) j1++
        const slabFree = (kk: number) => {
          for (let jj = j; jj < j1; jj++) if (!rowFree(jj, kk)) return false
          return true
        }
        let k1 = k + 1
        while (k1 < nz && slabFree(k1)) k1++
        for (let kk = k; kk < k1; kk++) {
          for (let jj = j; jj < j1; jj++) for (let ii = i; ii < i1; ii++) taken[index(ii, jj, kk)] = true
        }
        out.push({ min: [lines[0][i], lines[1][j], lines[2][k]], max: [lines[0][i1], lines[1][j1], lines[2][k1]] })
      }
    }
  }
  return out
}

/**
 * Every panel's solid wood, as boxes in world millimetres: its box less what
 * its cuts take out. A whole-shape cut takes out the cutting panel as that
 * panel is itself cut, so joints chain; a loop of such cuts (A into B into A)
 * is broken by treating the panel met again as its plain box. Panels without
 * cuts are a single box.
 */
export function panelSolids(panels: Panel[]): Map<string, Bounds[]> {
  const byId = new Map(panels.map((p) => [p.id, p]))
  const done = new Map<string, Bounds[]>()
  const busy = new Set<string>()

  const solid = (panel: Panel): Bounds[] => {
    const known = done.get(panel.id)
    if (known) return known
    const box = panelBounds(panel)
    if (busy.has(panel.id)) return [box]
    busy.add(panel.id)
    const removed = (panel.cuts ?? []).flatMap((cut) => {
      const by = byId.get(cut.by)
      if (!by || by.id === panel.id) return []
      if (cut.half) {
        const shared = intersectBounds(box, panelBounds(by))
        return shared ? [halfOf(shared, cut.half)] : []
      }
      return solid(by)
        .map((b) => intersectBounds(box, b))
        .filter((b): b is Bounds => b !== null)
    })
    busy.delete(panel.id)
    const result = subtractBoxes(box, removed)
    done.set(panel.id, result)
    return result
  }

  panels.forEach(solid)
  return done
}

let lastSolids: { panels: Panel[]; solids: Map<string, Bounds[]> } | null = null

/** `panelSolids` for the store's panel list, worked out once per change to it
 *  however many parts of the view ask. */
export function solidsOf(panels: Panel[]): Map<string, Bounds[]> {
  if (lastSolids?.panels !== panels) lastSolids = { panels, solids: panelSolids(panels) }
  return lastSolids.solids
}

/**
 * A panel's solid, as `localSolid` gives it, written as a short string — one
 * that stays the same while the shape does, so a mesh is rebuilt only when
 * its cuts change, not on every frame something else is dragged.
 */
export function solidKey(panel: Panel, solid: Bounds[] | undefined): string {
  const local = localSolid(panel, solid)
  return local ? local.map((b) => [...b.min, ...b.max].map((x) => Math.round(x * 1000) / 1000).join(',')).join(';') : ''
}

/** The boxes `solidKey` wrote. */
export function parseSolidKey(key: string): Bounds[] | null {
  if (!key) return null
  return key.split(';').map((box) => {
    const n = box.split(',').map(Number)
    return { min: [n[0], n[1], n[2]], max: [n[3], n[4], n[5]] }
  })
}

/**
 * A panel's solid as boxes in mm from its own centre — what its mesh is built
 * from — or null when its cuts don't reach it and it's still the plain box.
 */
export function localSolid(panel: Panel, solid: Bounds[] | undefined): Bounds[] | null {
  if (!solid) return null
  const box = panelBounds(panel)
  const same = (a: Vec3, b: Vec3) => [0, 1, 2].every((k) => Math.abs(a[k] - b[k]) < SLIVER)
  const plain = solid.length === 1 && same(solid[0].min, box.min) && same(solid[0].max, box.max)
  if (plain) return null
  const local = (v: Vec3) => v.map((x, k) => x - panel.position[k]) as Vec3
  return solid.map((b) => ({ min: local(b.min), max: local(b.max) }))
}

/** The cuts panel `a` takes from panel `b`. */
export const cutsBy = (a: Panel, b: Panel): Cut[] => (a.cuts ?? []).filter((c) => c.by === b.id)

/** Panel `a`'s cuts with those from `b` left out. */
export const cutsWithout = (a: Panel, b: Panel): Cut[] => (a.cuts ?? []).filter((c) => c.by !== b.id)

/** Drop every cut made by one of `gone`, which are being deleted. */
export function dropCutsBy(panels: Panel[], gone: Set<string>): Panel[] {
  return panels.map((p) =>
    p.cuts?.some((c) => gone.has(c.by)) ? withCuts(p, p.cuts.filter((c) => !gone.has(c.by))) : p,
  )
}

/** A panel with its cuts replaced; an empty list leaves no `cuts` field. */
export function withCuts(panel: Panel, cuts: Cut[]): Panel {
  const { cuts: _, ...rest } = panel
  return cuts.length > 0 ? { ...rest, cuts } : rest
}
