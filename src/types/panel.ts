/** Axis along which a panel's thickness runs. The panel's face lies in the
 *  plane of the other two axes. World convention: Y is up (height), Z is depth. */
export type Axis = 'x' | 'y' | 'z'

/** Which face edge the wood grain runs along, used when nesting parts onto
 *  sheet goods. `none` means no grain constraint — the part may rotate freely
 *  for tighter packing. Woodworking default is the longer edge (see
 *  `defaultGrain`). */
export type Grain = 'length' | 'width' | 'none'

/**
 * A rectangular plywood panel — the atomic building block of a cabinet.
 *
 * A panel is fully described by a face (`length` x `width`) and a `thickness`
 * that runs along its `normal` axis. Thickness is the one dimension the user
 * cannot change by dragging in the viewport; it is edited in the properties
 * panel and typically follows the chosen material.
 *
 * All measurements are in millimetres. `position` is the centre of the panel
 * in world space. `thickness` is edited in the properties panel and is the one
 * dimension the viewport won't let you drag. `materialId` is just identity
 * (name + colour), independent of thickness.
 */
export interface Panel {
  id: string
  name: string
  normal: Axis
  length: number
  width: number
  thickness: number
  position: [number, number, number]
  materialId: string
  /** Which face edge the grain runs along, for cutlist nesting. Defaults to the
   *  longer edge (see `defaultGrain`). */
  grain: Grain
  /** When true the part is skipped by the cutlist nesting (e.g. it's already
   *  cut). Absent/false means it's included. */
  excludeFromCutlist?: boolean
  /** When true the panel is drawn as a non-interactive ghost: still visible as a
   *  faint mesh and still counted for snapping, overlaps and the cutlist, but it
   *  can't be clicked or dragged in the viewport. Toggled from the parts list.
   *  Absent/false means it's a normal, solid, clickable panel. */
  hidden?: boolean
}

/** Woodworking default: grain runs along the longer face edge. Ties go to
 *  length. */
export function defaultGrain(length: number, width: number): Grain {
  return width > length ? 'width' : 'length'
}
