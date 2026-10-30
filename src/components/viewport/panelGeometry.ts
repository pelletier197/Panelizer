import { ExtrudeGeometry, Matrix4, Shape, Vector2, Vector3, type BufferGeometry } from 'three'
import type { Panel } from '../../types/panel'
import { MM_TO_M, axisField } from '../../lib/geometry'
import { cornerRadii, hasRounding, roundedOutline } from '../../lib/rounding'

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
