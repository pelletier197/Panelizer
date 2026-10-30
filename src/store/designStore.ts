import { create } from 'zustand'
import type { Panel } from '../types/panel'
import type { SnapHint } from '../lib/snapping'
import type { Design } from '../lib/persistence'
import type { Material } from '../lib/materials'
import type { Stock } from '../lib/stock'
import type { Unit } from '../lib/units'
import { createPanel, defaultThickness } from '../lib/panel'
import { repairPrecision } from '../lib/repair'
import type { PanelPatch } from '../lib/resize'
import type { CutStyle } from '../lib/nesting'
import { rotatePanels } from '../lib/rotate'
import { createMaterial, findMaterial } from '../lib/materials'
import { createStock } from '../lib/stock'
import { emptyDesign, DEFAULT_NAME } from '../lib/persistence'
import * as projects from '../lib/projects'

/** Active viewport tool.
 *  - `move` / `resize` show a drag gizmo (translate / per-face resize).
 *  - `move-snap` and `measure` show clickable panel corners. */
export type Tool = 'move' | 'move-snap' | 'resize' | 'measure'

type Point = [number, number, number]

/** A panel-editor field the viewport should point at: a size field (the edge
 *  it changes) or a position field (the axis it moves along). */
export type FieldHighlight =
  | { kind: 'size'; field: 'length' | 'width' | 'thickness' }
  | { kind: 'position'; axis: 0 | 1 | 2 }
  | { kind: 'corner'; index: 0 | 1 | 2 | 3 }

/** How a box-select combines with the existing selection. */
export type BoxSelectOp = 'add' | 'remove' | 'replace'

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

/** An undoable design snapshot: exactly the saved document. Selection and tool
 *  are transient and left out. */
type Snapshot = Design

/** The design part of the state, picked out field by field. This is the one
 *  place the store lists the document's fields: undo, redo and autosave all go
 *  through it, so a field added to `Design` only needs adding here. */
const pickDesign = (s: Design): Design => ({
  name: s.name,
  panels: s.panels,
  materials: s.materials,
  stocks: s.stocks,
  unit: s.unit,
  precision: s.precision,
  kerf: s.kerf,
  margin: s.margin,
  cutStyle: s.cutStyle,
})

/** How far (mm, along X) a duplicate or paste lands from its source, so the
 *  copy doesn't hide exactly behind the original. */
const COPY_OFFSET = 30

/** How many undo steps to keep. */
const HISTORY_LIMIT = 100

/** A corner the user picked as the first click of a corner-pick tool
 *  (`move-snap`, `resize-point`, `measure`). */
export interface ToolPick {
  panelId: string
  index: number
  point: Point
}

/** The design document (see `Design` for its fields) plus transient UI state
 *  and the actions that change either. */
interface DesignState extends Design {
  /** Selected panels. Empty = nothing selected; one id = the classic single
   *  selection; several = a multi-selection (Shift+click) that moves together.
   *  The last id is the "primary" — it carries the move gizmo. */
  selectedIds: string[]
  tool: Tool
  toolPick: ToolPick | null
  measurement: { a: Point; b: Point } | null
  /** Whether orbit navigation is live. Resize handles switch this off while
   *  the pointer is on them so a face-drag never spins the camera. */
  orbitEnabled: boolean
  /** Panels the box-select being dragged would catch, lit in the viewport so
   *  the result is visible before release. Empty when no box is open.
   *  Transient UI state. */
  boxPreview: string[]
  setBoxPreview: (ids: string[]) => void
  /** Panels whose row is under the pointer in the parts list, lit in the
   *  viewport the same way as a box-select preview. Transient UI state. */
  hoverIds: string[]
  setHoverIds: (ids: string[]) => void
  /** Whether Shift (the box-select key) is down. While it is, the move gizmo
   *  stands aside so a Shift+drag always draws a box. Transient UI state. */
  boxKeyHeld: boolean
  /** Where the selection would land if the hovered rotate button were
   *  pressed, drawn as ghosts in the viewport. Empty when nothing is hovered.
   *  Transient UI state — never part of the design. */
  rotatePreview: Panel[]
  /** The panel-editor field under the pointer, and the one in focus, so the
   *  viewport can light up what it changes: a size field's edge, or a position
   *  field's axis. The hovered one wins, so pointing at a field while typing in
   *  another shows the one pointed at, then falls back. Transient UI state. */
  fieldHover: FieldHighlight | null
  fieldFocus: FieldHighlight | null
  setFieldHighlight: (source: 'hover' | 'focus', highlight: FieldHighlight | null) => void
  setRotatePreview: (panels: Panel[]) => void
  setBoxKeyHeld: (held: boolean) => void
  /** Apply a box-select: `add` the caught panels to the selection, `remove`
   *  them from it, or `replace` it. Hidden panels are never selected. */
  selectInBox: (ids: string[], op: BoxSelectOp) => void
  /** Select every visible panel. */
  selectAll: () => void
  /** Swap the selection for every visible panel that isn't in it. */
  invertSelection: () => void
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
  /** Undo/redo stacks of design snapshots (transient, not persisted). */
  past: Snapshot[]
  future: Snapshot[]
  /** The pre-drag snapshot captured on the first live update of a drag, so the
   *  whole drag collapses into one undo step (not one per frame). Internal. */
  dragOrigin: Snapshot | null
  /** One-shot guard so a resize drag-release doesn't select the panel under
   *  the cursor. Internal. */
  suppressSelect: boolean
  /** Whether the full-screen cutlist view is open. Transient UI state. */
  cutlistOpen: boolean
  setCutlistOpen: (open: boolean) => void
  setTool: (tool: Tool) => void
  setToolPick: (pick: ToolPick | null) => void
  setMeasurement: (m: { a: Point; b: Point } | null) => void
  setOrbitEnabled: (enabled: boolean) => void
  undo: () => void
  redo: () => void

  addPanel: (preset?: Partial<Panel>) => void
  updatePanel: (id: string, patch: Partial<Panel>) => void
  /** Apply the same patch to several panels in one undo step. */
  updatePanels: (ids: string[], patch: Partial<Panel>) => void
  movePanelLive: (id: string, position: [number, number, number]) => void
  /** Live (non-persisted) move of several panels at once — the group drag. */
  movePanelsLive: (moves: { id: string; position: [number, number, number] }[]) => void
  /** Commit a group move as a single undo step. */
  commitPanelsMove: (moves: { id: string; position: [number, number, number] }[]) => void
  /** Live (non-persisted) per-panel patches — one frame of a (group) resize. */
  patchPanelsLive: (patches: PanelPatch[]) => void
  /** Commit per-panel patches as a single undo step. */
  commitPanelPatches: (patches: PanelPatch[]) => void
  /** Revert a deferred gesture: apply the given patches (the panels' pre-gesture
   *  fields) and drop the pending drag snapshot, WITHOUT touching undo history —
   *  nothing was committed, so this leaves the saved state untouched. Used when
   *  a move/resize typed-entry box is cancelled with Escape. */
  restorePanels: (restore: { id: string; patch: Partial<Panel> }[]) => void
  /** Remove panels in one undo step (single or multi-selection delete). */
  removePanels: (ids: string[]) => void
  /** Show/hide several panels in one undo step. Hidden panels render as ghosts
   *  and can't be clicked, but still count for snapping/overlaps/cutlist. */
  setHidden: (ids: string[], hidden: boolean) => void
  /** Copy panels (offset so they don't hide the originals) and select the
   *  copies, in one undo step. */
  duplicatePanels: (ids: string[]) => void
  /** Turn the selection a quarter turn about world axis `about` (0=X, 1=Y,
   *  2=Z), as a group around its centre, in one undo step. `dir` 1 is
   *  counter-clockwise looking down the axis, −1 the other way. */
  rotateSelection: (about: 0 | 1 | 2, dir: 1 | -1) => void
  /** Panels copied with Ctrl+C, as they were at copy time. In-app only (not
   *  the system clipboard), transient, and never undone. */
  clipboard: Panel[]
  /** How many times the clipboard has been pasted, so each paste lands one
   *  step further out instead of stacking on the previous one. */
  pasteCount: number
  /** Copy the selection to the clipboard. */
  copySelection: () => void
  /** Add offset copies of the clipboard and select them, in one undo step. */
  paste: () => void
  select: (id: string | null) => void
  /** Select from a click in the 3D scene — no-ops once if a resize drag just
   *  armed suppression, so releasing a handle doesn't select the panel under it.
   *  `additive` (Shift+click) toggles the panel in/out of the current selection
   *  instead of replacing it. */
  sceneSelect: (id: string, additive?: boolean) => void
  /** Swallow the next scene-select (the click synthesised when a drag ends). */
  armSelectSuppression: () => void

  addMaterial: () => void
  updateMaterial: (id: string, patch: Partial<Material>) => void
  removeMaterial: (id: string) => void

  addStock: (materialId: string, thickness?: number) => void
  updateStock: (id: string, patch: Partial<Stock>) => void
  removeStock: (id: string) => void

  setUnit: (unit: Unit) => void
  /** Set the imperial working precision (fraction denominator). Snaps existing
   *  geometry to the new, coarser/finer grid too (via fixPrecision). */
  setPrecision: (precision: number) => void
  /** Switch the document unit AND convert the geometry onto the new unit's grid
   *  (snap sizes, close gaps). Lossy across systems (mm↔inch); the UI confirms
   *  first. One undo step. */
  convertUnit: (unit: Unit) => void
  /** Heal drift in the current unit: snap sizes to the exact grid and close
   *  hairline gaps at joints so parts add up exactly. One undo step. */
  fixPrecision: () => void
  setKerf: (mm: number) => void
  setMargin: (mm: number) => void
  setCutStyle: (style: CutStyle) => void
  /** Rename the project (one undo step, like any other edit). */
  setName: (name: string) => void

  /** The open project's storage id (see lib/projects). Not part of the design:
   *  the same design can be saved under several ids. */
  projectId: string
  /** Switch to a saved project. Undo history starts afresh. Returns false if
   *  the project can't be read. */
  openProject: (id: string) => boolean
  /** Start a new project and switch to it — empty, keeping the current
   *  materials and settings, or holding `design` (an import, a shared link). */
  newProject: (design?: Design) => void
  /** Delete a saved project; deleting the open one switches to the most recent
   *  other project, or a new one. */
  deleteProject: (id: string) => void
}

/** Nudge each new panel diagonally so freshly added parts don't stack exactly
 *  on top of one another and become impossible to click. */
const spawnOffset = (index: number): [number, number, number] => [index * 30, index * 30, 0]

/** Everything about a working session that belongs to one project only and
 *  is dropped when switching: selection, history, gestures, previews. */
const FRESH_SESSION = {
  selectedIds: [],
  past: [],
  future: [],
  dragOrigin: null,
  gesture: null,
  toolPick: null,
  measurement: null,
  snapHints: [],
  boxPreview: [],
  rotatePreview: [],
} satisfies Partial<DesignState>

const createDesignStore = () => create<DesignState>((set, get) => {
  const initial = projects.openInitialProject()

  const snapshot = pickDesign

  // Every persisted change funnels through here so state and the undo history
  // stay in sync (autosave follows from the subscription below the store). The
  // pre-change snapshot is pushed onto `past` and the redo stack is cleared (a
  // fresh edit forks history). Selection is transient and intentionally left
  // out of both autosave and history.
  const commit = (next: Partial<DesignState>) => {
    const current = get()
    // A drag's "before" is the state at its first live frame (`dragOrigin`), so
    // the whole drag is one undo step; a plain edit has no dragOrigin.
    const before = current.dragOrigin ?? snapshot(current)
    set({
      ...next,
      past: [...current.past, before].slice(-HISTORY_LIMIT),
      future: [],
      dragOrigin: null,
    })
  }

  // Live (non-persisted) drag update. Captures the pre-drag snapshot once so
  // the eventual commit can attribute the whole drag to a single undo step.
  const live = (panels: Panel[]) => {
    const current = get()
    set({ panels, dragOrigin: current.dragOrigin ?? snapshot(current) })
  }

  // Move one step through history. `snap` is the snapshot to apply; the current
  // state is pushed onto the opposite stack so the move is itself reversible.
  const applyHistory = (snap: Snapshot, from: 'past' | 'future') => {
    const current = get()
    const ids = new Set(snap.panels.map((p) => p.id))
    set({
      ...snap,
      selectedIds: current.selectedIds.filter((id) => ids.has(id)),
      toolPick: null,
      dragOrigin: null,
      past: from === 'past' ? current.past.slice(0, -1) : [...current.past, snapshot(current)],
      future: from === 'future' ? current.future.slice(1) : [snapshot(current), ...current.future],
    })
  }

  // Apply `fn` to the panels whose id is in `ids`, leaving the rest as-is.
  const mapPanels = (ids: Iterable<string>, fn: (p: Panel) => Panel): Panel[] => {
    const targets = new Set(ids)
    return get().panels.map((p) => (targets.has(p.id) ? fn(p) : p))
  }

  // Merge each patch into its panel, leaving unpatched panels as-is.
  const applyPatches = (patches: PanelPatch[]): Panel[] => {
    const byId = new Map(patches.map((x) => [x.id, x.patch]))
    return mapPanels(byId.keys(), (p) => ({ ...p, ...byId.get(p.id)! }))
  }

  // Add fresh copies of `sources`, shifted along X by `offset` mm, and select
  // them — one undo step. Shared by duplicate and paste. A copy whose material
  // was deleted since it was copied falls back to the first material.
  const addCopies = (sources: Panel[], offset: number) => {
    if (sources.length === 0) return
    const { materials } = get()
    const copies = sources.map((source) =>
      createPanel({
        ...source,
        name: `${source.name} copy`,
        materialId: findMaterial(materials, source.materialId).id,
        position: [source.position[0] + offset, source.position[1], source.position[2]],
      }),
    )
    commit({ panels: [...get().panels, ...copies], selectedIds: copies.map((c) => c.id) })
  }

  const visibleIds = () => get().panels.filter((p) => !p.hidden).map((p) => p.id)

  // Make `id` (holding `design`) the open project.
  const switchTo = (id: string, design: Design) => {
    projects.setCurrentProject(id)
    set({ ...pickDesign(design), ...FRESH_SESSION, projectId: id })
  }

  return {
    ...initial.design,
    projectId: initial.id,
    selectedIds: [],
    boxPreview: [],
    hoverIds: [],
    boxKeyHeld: false,
    rotatePreview: [],
    fieldHover: null,
    fieldFocus: null,
    snapHints: [],
    gesture: null,
    tool: 'move',
    toolPick: null,
    measurement: null,
    orbitEnabled: true,
    past: [],
    future: [],
    dragOrigin: null,
    suppressSelect: false,
    cutlistOpen: false,
    clipboard: [],
    pasteCount: 0,

    setCutlistOpen: (cutlistOpen) => set({ cutlistOpen }),

    // Switching tools clears any in-progress pick and the shown measurement,
    // and always restores orbit (in case a drag was interrupted).
    setTool: (tool) => set({ tool, toolPick: null, measurement: null, orbitEnabled: true, dragOrigin: null, gesture: null, snapHints: [] }),
    setToolPick: (toolPick) => set({ toolPick }),
    setMeasurement: (measurement) => set({ measurement }),
    setOrbitEnabled: (orbitEnabled) => set({ orbitEnabled }),

    undo: () => {
      const { past } = get()
      if (past.length > 0) applyHistory(past[past.length - 1], 'past')
    },
    redo: () => {
      const { future } = get()
      if (future.length > 0) applyHistory(future[0], 'future')
    },

    addPanel: (preset = {}) => {
      const panel = createPanel({
        position: spawnOffset(get().panels.length),
        materialId: get().materials[0].id,
        thickness: defaultThickness(get().unit),
        ...preset, // a preset may override thickness (e.g. a thin back)
      })
      commit({ panels: [...get().panels, panel], selectedIds: [panel.id] })
    },

    updatePanel: (id, patch) => get().updatePanels([id], patch),

    updatePanels: (ids, patch) => {
      if (ids.length > 0) commit({ panels: mapPanels(ids, (p) => ({ ...p, ...patch })) })
    },

    // Live position update during a drag: no autosave (the drop commits it),
    // so overlaps and neighbours recompute in real time without disk churn.
    movePanelLive: (id, position) => {
      live(get().panels.map((p) => (p.id === id ? { ...p, position } : p)))
    },

    movePanelsLive: (moves) => {
      const next = new Map(moves.map((m) => [m.id, m.position]))
      live(get().panels.map((p) => (next.has(p.id) ? { ...p, position: next.get(p.id)! } : p)))
    },

    commitPanelsMove: (moves) => {
      const next = new Map(moves.map((m) => [m.id, m.position]))
      commit({ panels: get().panels.map((p) => (next.has(p.id) ? { ...p, position: next.get(p.id)! } : p)) })
    },

    // Live length/width/position update while dragging a resize face handle;
    // same non-autosaved pattern as movePanelLive.
    patchPanelsLive: (patches) => live(applyPatches(patches)),

    commitPanelPatches: (patches) => {
      if (patches.length > 0) commit({ panels: applyPatches(patches) })
    },

    restorePanels: (restore) => {
      const byId = new Map(restore.map((r) => [r.id, r.patch]))
      set({
        panels: get().panels.map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id)! } : p)),
        dragOrigin: null,
      })
    },

    removePanels: (ids) => {
      if (ids.length === 0) return
      const drop = new Set(ids)
      commit({
        panels: get().panels.filter((p) => !drop.has(p.id)),
        selectedIds: get().selectedIds.filter((x) => !drop.has(x)),
      })
    },

    setHidden: (ids, hidden) => {
      if (ids.length === 0) return
      const targets = new Set(ids)
      commit({
        panels: mapPanels(targets, (p) => ({ ...p, hidden })),
        // A hidden panel can't be interacted with, so drop it from any active
        // selection (keeps a stale gizmo off a ghosted mesh).
        selectedIds: hidden ? get().selectedIds.filter((x) => !targets.has(x)) : get().selectedIds,
      })
    },

    duplicatePanels: (ids) => {
      const wanted = new Set(ids)
      addCopies(get().panels.filter((p) => wanted.has(p.id)), COPY_OFFSET)
    },

    rotateSelection: (about, dir) => {
      const chosen = new Set(get().selectedIds)
      get().commitPanelPatches(rotatePanels(get().panels.filter((p) => chosen.has(p.id)), about, dir))
    },

    copySelection: () => {
      const { panels, selectedIds } = get()
      const chosen = new Set(selectedIds)
      const clipboard = panels.filter((p) => chosen.has(p.id))
      if (clipboard.length > 0) set({ clipboard, pasteCount: 0 })
    },

    paste: () => {
      const { clipboard, pasteCount } = get()
      if (clipboard.length === 0) return
      addCopies(clipboard, COPY_OFFSET * (pasteCount + 1))
      set({ pasteCount: pasteCount + 1 })
    },

    setFieldHighlight: (source, highlight) => {
      const key = source === 'hover' ? 'fieldHover' : 'fieldFocus'
      // Small plain objects: comparing them serialised is enough to skip a
      // re-render when nothing changed.
      if (JSON.stringify(get()[key]) !== JSON.stringify(highlight)) set({ [key]: highlight })
    },

    setRotatePreview: (rotatePreview) => {
      if (rotatePreview.length > 0 || get().rotatePreview.length > 0) set({ rotatePreview })
    },

    setBoxKeyHeld: (boxKeyHeld) => {
      if (get().boxKeyHeld !== boxKeyHeld) set({ boxKeyHeld })
    },

    setHoverIds: (hoverIds) => {
      const current = get().hoverIds
      if (current.length === hoverIds.length && current.every((id, i) => id === hoverIds[i])) return
      set({ hoverIds })
    },

    setBoxPreview: (boxPreview) => {
      // Called on every pointer move; skip the re-render when nothing changed.
      const current = get().boxPreview
      if (current.length === boxPreview.length && current.every((id, i) => id === boxPreview[i])) return
      set({ boxPreview })
    },

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

    selectInBox: (ids, op) => {
      // Same rule as a click: a ghosted panel can't be picked.
      const visible = new Set(visibleIds())
      const picked = ids.filter((id) => visible.has(id))
      const current = get().selectedIds
      const selectedIds =
        op === 'replace'
          ? picked
          : op === 'add'
            ? Array.from(new Set([...current, ...picked]))
            : current.filter((id) => !picked.includes(id))
      set({ selectedIds, dragOrigin: null })
    },

    selectAll: () => set({ selectedIds: visibleIds(), dragOrigin: null }),

    invertSelection: () => {
      const current = new Set(get().selectedIds)
      set({ selectedIds: visibleIds().filter((id) => !current.has(id)), dragOrigin: null })
    },

    select: (id) => set({ selectedIds: id ? [id] : [], dragOrigin: null }),

    sceneSelect: (id, additive = false) => {
      if (get().suppressSelect) {
        set({ suppressSelect: false })
        return
      }
      const current = get().selectedIds
      const selectedIds = additive
        ? current.includes(id)
          ? current.filter((x) => x !== id) // toggle out
          : [...current, id] // add (becomes new primary)
        : [id]
      set({ selectedIds, dragOrigin: null })
    },

    // Arm suppression for the click the browser fires when a drag ends, and
    // self-clear next frame so a later genuine click still selects.
    armSelectSuppression: () => {
      set({ suppressSelect: true })
      requestAnimationFrame(() => set({ suppressSelect: false }))
    },

    addMaterial: () => {
      commit({ materials: [...get().materials, createMaterial(get().materials.length)] })
    },

    updateMaterial: (id, patch) => {
      commit({ materials: get().materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
    },

    // Can't delete the last material; panels using a removed one fall back to
    // the first remaining material (thickness is unaffected).
    removeMaterial: (id) => {
      const remaining = get().materials.filter((m) => m.id !== id)
      if (remaining.length === 0) return
      const fallback = remaining[0].id
      const remap = <T extends { materialId: string }>(x: T) =>
        x.materialId === id ? { ...x, materialId: fallback } : x
      commit({
        materials: remaining,
        panels: get().panels.map(remap),
        stocks: get().stocks.map(remap),
      })
    },

    addStock: (materialId, thickness) => {
      commit({ stocks: [...get().stocks, createStock(materialId, thickness, get().unit)] })
    },

    updateStock: (id, patch) => {
      commit({ stocks: get().stocks.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
    },

    removeStock: (id) => {
      commit({ stocks: get().stocks.filter((s) => s.id !== id) })
    },

    setUnit: (unit) => commit({ unit }),

    setPrecision: (precision) => {
      // Re-snap geometry onto the new precision grid so everything stays exact.
      commit({ precision, panels: repairPrecision(get().panels, get().unit, precision) })
    },

    convertUnit: (unit) => {
      // Snap all geometry onto the new unit's grid so values stay exact fractions
      // in the unit you're now working in, and close any gaps the snap opens.
      commit({ unit, panels: repairPrecision(get().panels, unit, get().precision) })
    },

    fixPrecision: () => {
      const { panels, unit, precision } = get()
      if (panels.length > 0) commit({ panels: repairPrecision(panels, unit, precision) })
    },
    setKerf: (kerf) => commit({ kerf: Math.max(0, kerf) }),
    setMargin: (margin) => commit({ margin: Math.max(0, margin) }),
    setCutStyle: (cutStyle) => commit({ cutStyle }),

    setName: (name) => commit({ name }),

    openProject: (id) => {
      if (id === get().projectId) return true
      const design = projects.loadProject(id)
      if (!design) return false
      switchTo(id, design)
      return true
    },

    newProject: (design) => {
      const current = get()
      const fresh = design ?? {
        ...emptyDesign(),
        // A new project starts from the shop you already have set up: same
        // materials and cutlist settings, nothing drawn and no sheet stock.
        materials: current.materials,
        unit: current.unit,
        precision: current.precision,
        kerf: current.kerf,
        margin: current.margin,
        cutStyle: current.cutStyle,
        name: DEFAULT_NAME,
      }
      const id = projects.newProjectId()
      // Saved straight away so it's in the list even before its first edit.
      projects.saveProject(id, fresh)
      switchTo(id, fresh)
    },

    deleteProject: (id) => {
      projects.deleteProject(id)
      if (id !== get().projectId) return
      const next = projects.listProjects().find((e) => projects.loadProject(e.id))
      const design = next && projects.loadProject(next.id)
      if (next && design) switchTo(next.id, design)
      else get().newProject()
    },
  }
})

/**
 * One store per page, however many times this file gets loaded.
 *
 * During a long `npm run dev` session, hot reloads can leave Vite serving this
 * file to different importers under different `?t=` versions — and every
 * version that loads would otherwise build a store of its own. The viewport
 * and the sidebar then quietly talk to different stores, and clicks and box
 * selections stop showing up. Parking the store on `globalThis` makes every
 * copy hand back the same one. (A production build bundles the file once, so
 * this only ever matters in development.)
 */
type StoreHolder = typeof globalThis & { __panelizerDesignStore?: ReturnType<typeof createDesignStore> }
const holder = globalThis as StoreHolder
const firstCopy = !holder.__panelizerDesignStore
export const useDesignStore = (holder.__panelizerDesignStore ??= createDesignStore())

// Because every copy reuses the store above, a hot update to this file (or
// anything it imports) couldn't swap in new store code — so reload the page
// for those instead, which builds a fresh store from the new code.
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload())

/** The design as it stands right now — for one-off reads at event time (export,
 *  share) that shouldn't subscribe a component to every edit. */
export const currentDesign = (): Design => pickDesign(useDesignStore.getState())

// Autosave: mirror every committed design change into the open project. Live
// drag frames (`dragOrigin` set) are skipped — the drop commits, and that
// commit saves. Switching project is skipped too: nothing was edited, and
// re-saving would wrongly bump the project to the top of the list.
// Kept out of the actions so they stay plain state transitions. Registered by
// the copy that built the store only, so a second copy can't double-save.
if (firstCopy) {
  useDesignStore.subscribe((state, prev) => {
    if (state.dragOrigin !== null || state.projectId !== prev.projectId) return
    const next = pickDesign(state)
    const before = pickDesign(prev)
    const changed = (Object.keys(next) as (keyof Design)[]).some((k) => next[k] !== before[k])
    if (changed) projects.saveProject(state.projectId, next)
  })
}
