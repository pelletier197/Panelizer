import type { SnapHint } from '../lib/snapping'
import type { Slice } from './types'

/** Active viewport tool.
 *  - `move` / `resize` show a drag gizmo (translate / per-face resize).
 *  - `move-snap` and `measure` show clickable panel corners. */
export type Tool = 'move' | 'move-snap' | 'resize' | 'measure'

type Point = [number, number, number]

/** A corner the user picked as the first click of a corner-pick tool
 *  (`move-snap`, `resize-point`, `measure`). */
export interface ToolPick {
  panelId: string
  index: number
  point: Point
}

/**
 * A live move/resize gesture, surfaced in the corner readout HUD. While the
 * pointer drags, `delta` is updated every frame (`editable: false`, read-only
 * display). On release the readout becomes `editable` so an exact amount can be
 * typed. `apply`/`commit`/`cancel` are set by the component that owns the drag
 * (it holds the frozen origin the numbers are measured from).
 */
export interface Gesture {
  kind: 'move' | 'resize'
  label: string // 'X' | 'Y' | 'Z' for move, 'Length' | 'Width' for resize
  delta: number // signed mm
  editable: boolean
  apply: (mm: number) => void
  commit: () => void
  cancel: () => void
}

/** The viewport's tools and what they show while in use (picks, measurements,
 *  snap guides, the gesture readout), and which full-screen views are open.
 *  All transient. */
export interface ToolsSlice {
  tool: Tool
  toolPick: ToolPick | null
  measurement: { a: Point; b: Point } | null
  /** Whether orbit navigation is live. Resize handles switch this off while
   *  the pointer is on them so a face-drag never spins the camera. */
  orbitEnabled: boolean
  setTool: (tool: Tool) => void
  setToolPick: (pick: ToolPick | null) => void
  setMeasurement: (m: { a: Point; b: Point } | null) => void
  setOrbitEnabled: (enabled: boolean) => void
  /** Active snap markers for the current drag, shown in the viewport as plane
   *  guides with a label (edge / butt / middle). Empty when not snapping.
   *  Transient UI state — never persisted or undone. */
  snapHints: SnapHint[]
  setSnapHints: (hints: SnapHint[]) => void
  /** Live move/resize readout, shown in the viewport's corner HUD. Null when no
   *  gesture is in progress. */
  gesture: Gesture | null
  startGesture: (gesture: Gesture) => void
  setGestureDelta: (delta: number) => void
  setGestureEditable: () => void
  clearGesture: () => void
  /** Whether the full-screen cutlist view is open. Transient UI state. */
  cutlistOpen: boolean
  setCutlistOpen: (open: boolean) => void
  /** Whether the full-screen presentation view is open. Transient UI state. */
  presentOpen: boolean
  setPresentOpen: (open: boolean) => void
}

export const toolsSlice: Slice<ToolsSlice> = (set, get) => ({
  tool: 'move',
  toolPick: null,
  measurement: null,
  orbitEnabled: true,
  snapHints: [],
  gesture: null,
  cutlistOpen: false,
  presentOpen: false,

  // Switching tools clears any in-progress pick and the shown measurement,
  // and always restores orbit (in case a drag was interrupted).
  setTool: (tool) => set({ tool, toolPick: null, measurement: null, orbitEnabled: true, dragOrigin: null, gesture: null, snapHints: [] }),
  setToolPick: (toolPick) => set({ toolPick }),
  setMeasurement: (measurement) => set({ measurement }),
  setOrbitEnabled: (orbitEnabled) => set({ orbitEnabled }),

  setSnapHints: (snapHints) => set({ snapHints }),

  startGesture: (gesture) => set({ gesture }),
  setGestureDelta: (delta) => {
    const g = get().gesture
    if (g) set({ gesture: { ...g, delta } })
  },
  setGestureEditable: () => {
    const g = get().gesture
    if (g) set({ gesture: { ...g, editable: true } })
  },
  clearGesture: () => set({ gesture: null }),

  setCutlistOpen: (cutlistOpen) => set({ cutlistOpen }),
  setPresentOpen: (presentOpen) => set({ presentOpen }),
})
