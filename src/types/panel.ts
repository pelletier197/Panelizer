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
  /** Which face edge the grain runs along — for cutlist nesting, and the way
   *  wood finishes are drawn. Defaults to the longer edge (see
   *  `defaultGrain`), and keeps to it as the panel is resized (see
   *  `followGrain`) unless set by hand. */
  grain: Grain
  /** True once the grain was chosen by hand: it then stays put when the panel
   *  is resized. Absent means automatic, along the longer edge. */
  grainSet?: boolean
  /** When true the part is skipped by the cutlist nesting (e.g. it's already
   *  cut). Absent/false means it's included. */
  excludeFromCutlist?: boolean
  /** When true the panel is drawn as a non-interactive ghost: still visible as a
   *  faint mesh and still counted for snapping, overlaps and the cutlist, but it
   *  can't be clicked or dragged in the viewport. Toggled from the parts list.
   *  Absent/false means it's a normal, solid, clickable panel. */
  hidden?: boolean
  /** Corner radii (mm) of the length × width face, one per corner in the
   *  face's own frame — see `lib/rounding.ts` for the numbering. Absent means
   *  square corners. Rounding stays inside the panel's rectangle. */
  corners?: [number, number, number, number]
  /** Wood taken out of this panel by the panels it's joined to — dados,
   *  grooves, rabbets, laps. Each cut follows the panel doing the cutting as
   *  it moves or resizes (see `lib/cuts.ts`). Absent means a plain box. The
   *  cutlist still sees the full rectangle: you cut the part, then the joint. */
  cuts?: Cut[]
}

/**
 * A cut taken out of a panel by another panel, `by`. Without `half`, the
 * other panel's whole shape comes out where they meet (as that panel is
 * itself cut, so joints chain: a post cut down to a quarter only takes a
 * quarter out of the rails). With `half`, only half of where the two boxes
 * meet comes out: the half on the `side` (−1 low, +1 high) of its middle
 * along world `axis` — one side of a half lap.
 */
export interface Cut {
  by: string
  half?: { axis: 0 | 1 | 2; side: -1 | 1 }
}

/** Woodworking default: grain runs along the longer face edge. Ties go to
 *  length. */
export function defaultGrain(length: number, width: number): Grain {
  return width > length ? 'width' : 'length'
}
