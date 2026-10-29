import type { Panel } from '../types/panel'
import { panelBounds, type Bounds } from './bounds'

type Vec3 = [number, number, number]

/** Extra room around a framed design, so it doesn't touch the viewport edges. */
const FRAME_MARGIN = 1.2

/** The box enclosing every given panel (mm), or null for none. */
export function unionBounds(panels: Panel[]): Bounds | null {
  if (panels.length === 0) return null
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const panel of panels) {
    const b = panelBounds(panel)
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], b.min[a])
      max[a] = Math.max(max[a], b.max[a])
    }
  }
  return { min, max }
}

/**
 * Where to put a perspective camera so `bounds` fills the view, keeping the
 * current viewing direction (`viewDir`: unit vector from the orbit target to
 * the camera). Fits the box's bounding sphere against the narrower of the two
 * fields of view, so it fits whether the viewport is wide or tall.
 *
 * Returns the new orbit `target` (the box centre) and camera `position`, in mm.
 */
export function frameBounds(
  bounds: Bounds,
  viewDir: Vec3,
  fovDeg: number,
  aspect: number,
): { target: Vec3; position: Vec3 } {
  const target = [0, 1, 2].map((a) => (bounds.min[a] + bounds.max[a]) / 2) as Vec3
  const radius = Math.max(1, Math.hypot(...([0, 1, 2].map((a) => bounds.max[a] - bounds.min[a]) as Vec3)) / 2)

  const halfV = (fovDeg * Math.PI) / 360
  const halfH = Math.atan(Math.tan(halfV) * aspect)
  const distance = (radius / Math.sin(Math.min(halfV, halfH))) * FRAME_MARGIN

  const position = target.map((c, a) => c + viewDir[a] * distance) as Vec3
  return { target, position }
}
