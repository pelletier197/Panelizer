import type { Panel } from '../types/panel'
import { panelCorners, type Point } from './corners'

/** A screen-space rectangle in pixels, top-left origin. */
export interface ScreenRect {
  x: number
  y: number
  w: number
  h: number
}

type Vec2 = [number, number]

/**
 * How the box decides what it caught, CAD-style:
 * - `enclose` (dragged left → right): only panels entirely inside the box.
 * - `touch` (dragged right → left): any panel the box touches.
 */
export type BoxRule = 'enclose' | 'touch'

/** The rule a drag implies from its direction. */
export const ruleForDrag = (startX: number, endX: number): BoxRule => (endX >= startX ? 'enclose' : 'touch')

/** The normalised rectangle between two drag points. */
export function rectFromDrag(a: Vec2, b: Vec2): ScreenRect {
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    w: Math.abs(b[0] - a[0]),
    h: Math.abs(b[1] - a[1]),
  }
}

/**
 * The ids of the visible panels a box catches.
 *
 * `project` maps a world point (mm) to screen pixels, or null when the point is
 * behind the camera. A panel with any corner behind the camera is skipped: its
 * on-screen shape is unbounded, so neither rule can judge it honestly.
 *
 * `touch` tests the panel's real on-screen silhouette (the convex hull of its
 * projected corners) against the box, not the silhouette's bounding rectangle —
 * that rectangle is far larger than the panel when it's seen at an angle, and
 * was why the old box picked up panels it never went near.
 */
export function panelsInRect(
  panels: Panel[],
  project: (p: Point) => Vec2 | null,
  rect: ScreenRect,
  rule: BoxRule,
): string[] {
  return panels
    .filter((panel) => {
      if (panel.hidden) return false
      const points = panelCorners(panel).map(project)
      if (points.some((p) => p === null)) return false
      const screen = points as Vec2[]
      return rule === 'enclose' ? screen.every((p) => inRect(p, rect)) : polygonTouchesRect(convexHull(screen), rect)
    })
    .map((p) => p.id)
}

const inRect = ([x, y]: Vec2, r: ScreenRect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Convex hull (Andrew's monotone chain), counter-clockwise, no repeats. */
export function convexHull(points: Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (sorted.length < 3) return sorted
  const half = (pts: Vec2[]) => {
    const out: Vec2[] = []
    for (const p of pts) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

/** Whether a convex polygon and an axis-aligned rectangle overlap, by the
 *  separating-axis test: they're apart only if some edge normal of either
 *  shape splits them. */
export function polygonTouchesRect(polygon: Vec2[], r: ScreenRect): boolean {
  if (polygon.length === 0) return false
  const rect: Vec2[] = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ]
  const axes: Vec2[] = [[1, 0], [0, 1]]
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i]
    const [bx, by] = polygon[(i + 1) % polygon.length]
    axes.push([ay - by, bx - ax])
  }
  return axes.every((axis) => {
    const [pMin, pMax] = extent(polygon, axis)
    const [rMin, rMax] = extent(rect, axis)
    return pMin <= rMax && rMin <= pMax
  })
}

function extent(points: Vec2[], [ax, ay]: Vec2): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const [x, y] of points) {
    const d = x * ax + y * ay
    min = Math.min(min, d)
    max = Math.max(max, d)
  }
  return [min, max]
}
