import type { Axis, Panel } from '../types/panel'

/** Scene is modelled in millimetres but rendered in metres, so Three.js works
 *  with comfortable ~1-unit numbers. Multiply mm by this to get metres. */
export const MM_TO_M = 0.001

type Vec3 = [number, number, number]

/** Convert a millimetre point/size into the metres the scene renders in. */
export const toMetres = ([x, y, z]: Vec3): Vec3 => [x * MM_TO_M, y * MM_TO_M, z * MM_TO_M]

/**
 * Map a panel's logical dimensions onto a world-space box size `[x, y, z]`.
 *
 * The `thickness` always runs along the panel's `normal`; `length` and `width`
 * fill the remaining two axes. With Y up and Z as depth this reads naturally:
 *  - normal `x` (upright side):   length -> Z (depth),  width -> Y (height)
 *  - normal `y` (shelf / top):    length -> X (span),   width -> Z (depth)
 *  - normal `z` (back / door):    length -> X (span),   width -> Y (height)
 */
export function panelBoxSize({ length, width, thickness, normal }: Panel): Vec3 {
  switch (normal) {
    case 'x':
      return [thickness, width, length]
    case 'y':
      return [length, thickness, width]
    case 'z':
      return [length, width, thickness]
  }
}

type Dimension = 'length' | 'width' | 'thickness'

const AXIS_FIELD: Record<Axis, [Dimension, Dimension, Dimension]> = {
  x: ['thickness', 'width', 'length'],
  y: ['length', 'thickness', 'width'],
  z: ['length', 'width', 'thickness'],
}

/** Inverse of `panelBoxSize`: which panel field a world axis maps to for a
 *  given orientation. `axis` is 0=X, 1=Y, 2=Z. */
export function axisField(normal: Axis, axis: 0 | 1 | 2): Dimension {
  return AXIS_FIELD[normal][axis]
}

/** World direction names for each axis: [the − side, the + side]. */
export const SIDE_NAMES = [
  ['left', 'right'],
  ['bottom', 'top'],
  ['back', 'front'],
] as const
