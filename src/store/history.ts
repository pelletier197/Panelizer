import type { Design } from '../lib/persistence'
import { followGrain } from '../lib/panel'
import type { GetState, SetState, Slice, StoreTools } from './types'

/** An undoable design snapshot: exactly the saved document. Selection and tool
 *  are transient and left out. */
export type Snapshot = Design

/** The design part of the state, picked out field by field. This is the one
 *  place the store lists the document's fields: undo, redo and autosave all go
 *  through it, so a field added to `Design` only needs adding here. */
export const pickDesign = (s: Design): Design => ({
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

/** How many undo steps to keep. */
const HISTORY_LIMIT = 100

export interface HistorySlice {
  /** Undo/redo stacks of design snapshots (transient, not persisted). */
  past: Snapshot[]
  future: Snapshot[]
  /** The pre-drag snapshot captured on the first live update of a drag, so the
   *  whole drag collapses into one undo step (not one per frame). Internal. */
  dragOrigin: Snapshot | null
  undo: () => void
  redo: () => void
}

/** The shared editing tools every slice changes the design through. */
export function createTools(set: SetState, get: GetState): StoreTools {
  // Every persisted change funnels through here so state and the undo history
  // stay in sync (autosave follows from the subscription below the store). The
  // pre-change snapshot is pushed onto `past` and the redo stack is cleared (a
  // fresh edit forks history). Selection is transient and intentionally left
  // out of both autosave and history.
  const commit: StoreTools['commit'] = (next) => {
    const current = get()
    // A drag's "before" is the state at its first live frame (`dragOrigin`), so
    // the whole drag is one undo step; a plain edit has no dragOrigin.
    const before = current.dragOrigin ?? pickDesign(current)
    set({
      ...next,
      past: [...current.past, before].slice(-HISTORY_LIMIT),
      future: [],
      dragOrigin: null,
    })
  }

  // Live (non-persisted) drag update. Captures the pre-drag snapshot once so
  // the eventual commit can attribute the whole drag to a single undo step.
  const live: StoreTools['live'] = (panels) => {
    const current = get()
    set({ panels, dragOrigin: current.dragOrigin ?? pickDesign(current) })
  }

  // Every panel edit comes through here, so this is also where an automatic
  // grain follows a resize onto the long edge.
  const mapPanels: StoreTools['mapPanels'] = (ids, fn) => {
    const targets = new Set(ids)
    return get().panels.map((p) => (targets.has(p.id) ? followGrain(p, fn(p)) : p))
  }

  const applyPatches: StoreTools['applyPatches'] = (patches) => {
    const byId = new Map(patches.map((x) => [x.id, x.patch]))
    return mapPanels(byId.keys(), (p) => ({ ...p, ...byId.get(p.id)! }))
  }

  return { commit, live, mapPanels, applyPatches }
}

export const historySlice: Slice<HistorySlice> = (set, get) => {
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
      past: from === 'past' ? current.past.slice(0, -1) : [...current.past, pickDesign(current)],
      future: from === 'future' ? current.future.slice(1) : [pickDesign(current), ...current.future],
    })
  }

  return {
    past: [],
    future: [],
    dragOrigin: null,

    undo: () => {
      const { past } = get()
      if (past.length > 0) applyHistory(past[past.length - 1], 'past')
    },
    redo: () => {
      const { future } = get()
      if (future.length > 0) applyHistory(future[0], 'future')
    },
  }
}
