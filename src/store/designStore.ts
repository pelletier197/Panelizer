import { create } from 'zustand'
import type { Panel } from '../types/panel'
import type { Design } from '../lib/persistence'
import type { Material } from '../lib/materials'
import type { Stock } from '../lib/stock'
import type { Unit } from '../lib/units'
import { createPanel, defaultThickness } from '../lib/panel'
import { createMaterial } from '../lib/materials'
import { createStock } from '../lib/stock'
import { loadFromStorage, saveToStorage } from '../lib/persistence'

/** Active viewport tool.
 *  - `move` / `resize` show a drag gizmo (translate / per-face resize).
 *  - `move-snap` and `measure` show clickable panel corners. */
export type Tool = 'move' | 'move-snap' | 'resize' | 'measure'

type Point = [number, number, number]

/** An undoable design snapshot. Selection and tool are transient and left out. */
interface Snapshot {
  panels: Panel[]
  materials: Material[]
  stocks: Stock[]
  unit: Unit
  kerf: number
  margin: number
}

/** How many undo steps to keep. */
const HISTORY_LIMIT = 100

/** A corner the user picked as the first click of a corner-pick tool
 *  (`move-snap`, `resize-point`, `measure`). */
export interface ToolPick {
  panelId: string
  index: number
  point: Point
}

interface DesignState {
  panels: Panel[]
  materials: Material[]
  stocks: Stock[]
  unit: Unit
  kerf: number
  margin: number
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
  /** Left-drag behaviour in the viewport: `orbit` spins the camera (default),
   *  `select` draws a rubber-band box that selects the panels it covers.
   *  Toggled from the corner control in the viewport. Transient UI state. */
  dragMode: 'orbit' | 'select'
  setDragMode: (mode: 'orbit' | 'select') => void
  /** A completed marquee rectangle (canvas pixels) handed from the DOM overlay
   *  to the in-canvas picker, which projects panels against it and selects.
   *  Cleared once consumed. */
  marqueeBox: { x: number; y: number; w: number; h: number; additive: boolean } | null
  setMarqueeBox: (box: DesignState['marqueeBox']) => void
  /** Replace (or, when additive, extend) the selection with a set of ids —
   *  used by the marquee box-select. */
  selectInBox: (ids: string[], additive: boolean) => void
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
  movePanelLive: (id: string, position: [number, number, number]) => void
  /** Live (non-persisted) move of several panels at once — the group drag. */
  movePanelsLive: (moves: { id: string; position: [number, number, number] }[]) => void
  /** Commit a group move as a single undo step. */
  commitPanelsMove: (moves: { id: string; position: [number, number, number] }[]) => void
  resizePanelLive: (id: string, patch: Partial<Panel>) => void
  removePanel: (id: string) => void
  /** Remove several panels in one undo step (multi-selection delete). */
  removePanels: (ids: string[]) => void
  duplicatePanel: (id: string) => void
  setPanelMaterial: (panelId: string, materialId: string) => void
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
  setKerf: (mm: number) => void
  setMargin: (mm: number) => void
  loadDesign: (design: Design) => void
  clear: () => void
}

/** Nudge each new panel diagonally so freshly added parts don't stack exactly
 *  on top of one another and become impossible to click. */
const spawnOffset = (index: number): [number, number, number] => [index * 30, index * 30, 0]

export const useDesignStore = create<DesignState>((set, get) => {
  const initial = loadFromStorage()

  const snapshot = (s: DesignState): Snapshot => ({
    panels: s.panels,
    materials: s.materials,
    stocks: s.stocks,
    unit: s.unit,
    kerf: s.kerf,
    margin: s.margin,
  })

  // Every persisted change funnels through here so state, autosave, and the
  // undo history stay in sync. The pre-change snapshot is pushed onto `past`
  // and the redo stack is cleared (a fresh edit forks history). Selection is
  // transient and intentionally left out of both autosave and history.
  const commit = (next: Partial<DesignState>) => {
    const current = get()
    const merged = { ...current, ...next }
    saveToStorage(snapshot(merged))
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
    saveToStorage(snap)
    const ids = new Set(snap.panels.map((p) => p.id))
    set({
      panels: snap.panels,
      materials: snap.materials,
      stocks: snap.stocks,
      unit: snap.unit,
      kerf: snap.kerf,
      margin: snap.margin,
      selectedIds: current.selectedIds.filter((id) => ids.has(id)),
      toolPick: null,
      dragOrigin: null,
      past: from === 'past' ? current.past.slice(0, -1) : [...current.past, snapshot(current)],
      future: from === 'future' ? current.future.slice(1) : [snapshot(current), ...current.future],
    })
  }

  return {
    panels: initial.panels,
    materials: initial.materials,
    stocks: initial.stocks,
    unit: initial.unit,
    kerf: initial.kerf,
    margin: initial.margin,
    selectedIds: [],
    dragMode: 'orbit',
    marqueeBox: null,
    tool: 'move',
    toolPick: null,
    measurement: null,
    orbitEnabled: true,
    past: [],
    future: [],
    dragOrigin: null,
    suppressSelect: false,
    cutlistOpen: false,

    setCutlistOpen: (cutlistOpen) => set({ cutlistOpen }),

    // Switching tools clears any in-progress pick and the shown measurement,
    // and always restores orbit (in case a drag was interrupted).
    setTool: (tool) => set({ tool, toolPick: null, measurement: null, orbitEnabled: true, dragOrigin: null }),
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

    updatePanel: (id, patch) => {
      commit({ panels: get().panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
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
    resizePanelLive: (id, patch) => {
      live(get().panels.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    },

    removePanel: (id) => {
      commit({
        panels: get().panels.filter((p) => p.id !== id),
        selectedIds: get().selectedIds.filter((x) => x !== id),
      })
    },

    removePanels: (ids) => {
      const drop = new Set(ids)
      commit({
        panels: get().panels.filter((p) => !drop.has(p.id)),
        selectedIds: get().selectedIds.filter((x) => !drop.has(x)),
      })
    },

    duplicatePanel: (id) => {
      const source = get().panels.find((p) => p.id === id)
      if (!source) return
      const copy = createPanel({
        ...source,
        name: `${source.name} copy`,
        position: [source.position[0] + 30, source.position[1], source.position[2]],
      })
      commit({ panels: [...get().panels, copy], selectedIds: [copy.id] })
    },

    setPanelMaterial: (panelId, materialId) => {
      commit({
        panels: get().panels.map((p) => (p.id === panelId ? { ...p, materialId } : p)),
      })
    },

    // Leaving select mode drops any half-drawn marquee.
    setDragMode: (dragMode) => set({ dragMode, marqueeBox: null }),
    setMarqueeBox: (marqueeBox) => set({ marqueeBox }),

    selectInBox: (ids, additive) =>
      set((state) => ({
        selectedIds: additive ? Array.from(new Set([...state.selectedIds, ...ids])) : ids,
        dragOrigin: null,
      })),

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
    setKerf: (kerf) => commit({ kerf: Math.max(0, kerf) }),
    setMargin: (margin) => commit({ margin: Math.max(0, margin) }),

    loadDesign: ({ panels, materials, stocks, unit, kerf, margin }) =>
      commit({ panels, materials, stocks, unit, kerf, margin, selectedIds: [] }),

    clear: () => commit({ panels: [], stocks: [], selectedIds: [] }),
  }
})
