import {
  BoxGeometry,
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Shape,
  Vector2,
  Vector3,
} from 'three'
import type { Panel } from '../../types/panel'
import type { Bounds } from '../../lib/bounds'
import { MM_TO_M, axisField, panelBoxSize, toMetres } from '../../lib/geometry'
import { cornerRadii, hasRounding, roundedOutline } from '../../lib/rounding'
import { applyPanelUVs } from './finishLook'

type ShapeFields = Pick<Panel, 'length' | 'width' | 'thickness' | 'normal' | 'corners'>

/** Straight pieces per rounded corner — smooth at any zoom a cabinet sees. */
const ARC_SEGMENTS = 10

const axisOf = (normal: Panel['normal'], field: 'length' | 'width' | 'thickness'): 0 | 1 | 2 =>
  ([0, 1, 2] as const).find((a) => axisField(normal, a) === field)!

/**
 * The mesh geometry for a panel with rounded corners, centred on the origin
 * like the plain box it replaces: the face outline (see `roundedOutline`)
 * extruded to the panel's thickness, then turned so the outline's u / v run
 * along the panel's length / width axes and the extrusion along its normal.
 * Returns null for a square-cornered panel, which keeps the cheaper box.
 */
export function roundedPanelGeometry(panel: ShapeFields): BufferGeometry | null {
  if (!hasRounding(panel)) return null

  const outline = roundedOutline(panel.length, panel.width, cornerRadii(panel), ARC_SEGMENTS)
  const shape = new Shape(outline.map(([u, v]) => new Vector2(u * MM_TO_M, v * MM_TO_M)))
  const depth = panel.thickness * MM_TO_M
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  geometry.translate(0, 0, -depth / 2)

  // The extrusion is built in (u, v, w); map those onto world axes. A basis
  // that came out left-handed would turn the mesh inside out, so flip the
  // extrusion direction in that case — the box is centred, so it's the same
  // volume either way.
  const unit = (axis: 0 | 1 | 2) => new Vector3().setComponent(axis, 1)
  const u = unit(axisOf(panel.normal, 'length'))
  const v = unit(axisOf(panel.normal, 'width'))
  const w = unit(axisOf(panel.normal, 'thickness'))
  if (u.clone().cross(v).dot(w) < 0) w.negate()
  geometry.applyMatrix4(new Matrix4().makeBasis(u, v, w))
  return geometry
}

type Point = [number, number]

/** Below this (mm) two coordinates are the same line. */
const EPS = 1e-4

/** The part of a convex polygon inside the rectangle [u0, u1] × [v0, v1]
 *  (Sutherland–Hodgman), still counter-clockwise. */
function clipToRect(polygon: Point[], u0: number, u1: number, v0: number, v1: number): Point[] {
  const edges: [0 | 1, number, 1 | -1][] = [
    [0, u0, 1],
    [0, u1, -1],
    [1, v0, 1],
    [1, v1, -1],
  ]
  let out = polygon
  for (const [axis, at, keep] of edges) {
    const input = out
    out = []
    const inside = (p: Point) => (p[axis] - at) * keep >= -EPS
    input.forEach((p, i) => {
      const q = input[(i + 1) % input.length]
      if (inside(p)) out.push(p)
      if (inside(p) !== inside(q)) {
        const t = (at - p[axis]) / (q[axis] - p[axis])
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
      }
    })
    if (out.length < 3) return []
  }
  return out
}

/**
 * The mesh geometry for a panel with cuts taken out of it, centred on the
 * origin like the plain box. `solid` is the wood that's left, as boxes in mm
 * from the panel's centre (see `localSolid`).
 *
 * The panel is diced along every face of those boxes: slabs through its
 * thickness, and columns across its face, each column trimmed to the face
 * outline so rounded corners stay rounded. Only the faces of a cell that look
 * onto air are kept, so the inside of the wood has no faces — and since every
 * face is one whole cell side, neighbouring faces meet edge to edge, which
 * keeps the drawn edges to the real ones.
 */
export function cutPanelGeometry(panel: ShapeFields, local: Bounds[]): BufferGeometry {
  const u = axisOf(panel.normal, 'length')
  const v = axisOf(panel.normal, 'width')
  const w = axisOf(panel.normal, 'thickness')

  const lines = ([0, 1, 2] as const).map((k) => {
    const sorted = local.flatMap((b) => [b.min[k], b.max[k]]).sort((a, b) => a - b)
    return sorted.filter((x, i) => i === 0 || x - sorted[i - 1] > EPS)
  })
  const count = lines.map((l) => l.length - 1)
  const at = (cell: number[], k: number) => (lines[k][cell[k]] + lines[k][cell[k] + 1]) / 2
  const filled = (cell: number[]) =>
    cell.every((c, k) => c >= 0 && c < count[k]) &&
    local.some((b) => [0, 1, 2].every((k) => at(cell, k) > b.min[k] && at(cell, k) < b.max[k]))

  // The face outline, and each column's share of it.
  const outline: Point[] = hasRounding(panel)
    ? roundedOutline(panel.length, panel.width, cornerRadii(panel), ARC_SEGMENTS)
    : [
        [-panel.length / 2, -panel.width / 2],
        [panel.length / 2, -panel.width / 2],
        [panel.length / 2, panel.width / 2],
        [-panel.length / 2, panel.width / 2],
      ]
  const columns = new Map<string, Point[]>()
  const column = (iu: number, iv: number) => {
    const key = `${iu},${iv}`
    if (!columns.has(key)) {
      columns.set(key, clipToRect(outline, lines[u][iu], lines[u][iu + 1], lines[v][iv], lines[v][iv + 1]))
    }
    return columns.get(key)!
  }

  const positions: number[] = []
  const normals: number[] = []
  const world = (pu: number, pv: number, pw: number) => {
    const p = [0, 0, 0]
    p[u] = pu
    p[v] = pv
    p[w] = pw
    return p
  }
  // One flat triangle, wound to face `normal`.
  const triangle = (a: number[], b: number[], c: number[], normal: number[]) => {
    const ab = [0, 1, 2].map((k) => b[k] - a[k])
    const ac = [0, 1, 2].map((k) => c[k] - a[k])
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
    const facing = cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2]
    for (const p of facing >= 0 ? [a, b, c] : [a, c, b]) {
      positions.push(p[0] * MM_TO_M, p[1] * MM_TO_M, p[2] * MM_TO_M)
      normals.push(normal[0], normal[1], normal[2])
    }
  }

  const cell = [0, 0, 0]
  for (cell[u] = 0; cell[u] < count[u]; cell[u]++) {
    for (cell[v] = 0; cell[v] < count[v]; cell[v]++) {
      const polygon = column(cell[u], cell[v])
      if (polygon.length < 3) continue
      for (cell[w] = 0; cell[w] < count[w]; cell[w]++) {
        if (!filled(cell)) continue
        const w0 = lines[w][cell[w]]
        const w1 = lines[w][cell[w] + 1]

        // Top and bottom, where the slab next door is air.
        for (const [step, level] of [
          [1, w1],
          [-1, w0],
        ]) {
          const next = [...cell]
          next[w] += step
          if (filled(next)) continue
          const normal = world(0, 0, step)
          for (let i = 1; i < polygon.length - 1; i++) {
            triangle(
              world(...polygon[0], level),
              world(...polygon[i], level),
              world(...polygon[i + 1], level),
              normal,
            )
          }
        }

        // Sides: an edge on the column's own boundary only shows if the
        // column next door is air; an edge of the outline always shows.
        polygon.forEach((p, i) => {
          const q = polygon[(i + 1) % polygon.length]
          const du = q[0] - p[0]
          const dv = q[1] - p[1]
          const length = Math.hypot(du, dv)
          if (length < EPS) return
          const next = [...cell]
          if (Math.abs(du) < EPS && Math.abs(p[0] - lines[u][cell[u]]) < EPS) next[u]--
          else if (Math.abs(du) < EPS && Math.abs(p[0] - lines[u][cell[u] + 1]) < EPS) next[u]++
          else if (Math.abs(dv) < EPS && Math.abs(p[1] - lines[v][cell[v]]) < EPS) next[v]--
          else if (Math.abs(dv) < EPS && Math.abs(p[1] - lines[v][cell[v] + 1]) < EPS) next[v]++
          if (next.some((c, k) => c !== cell[k]) && filled(next) && column(next[u], next[v]).length >= 3) return
          // Counter-clockwise, so the outside is to the right of the edge.
          const normal = world(dv / length, -du / length, 0)
          const [a, b, c, d] = [world(...p, w0), world(...q, w0), world(...q, w1), world(...p, w1)]
          triangle(a, b, c, normal)
          triangle(a, c, d, normal)
        })
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  return geometry
}

/**
 * The mesh geometry for any panel: the plain box, the rounded outline when it
 * has rounded corners, or the diced shape when it has cuts (`solid`, see
 * `cutPanelGeometry`) — with texture coordinates in metres that follow its
 * grain (see `applyPanelUVs`), so finishes lie the right way.
 */
export function panelGeometry(
  panel: ShapeFields & Pick<Panel, 'id' | 'grain'>,
  solid?: Bounds[] | null,
): BufferGeometry {
  const geometry = solid
    ? cutPanelGeometry(panel, solid)
    : (roundedPanelGeometry(panel) ?? new BoxGeometry(...toMetres(panelBoxSize(panel as Panel))))
  applyPanelUVs(geometry, panel)
  return geometry
}
