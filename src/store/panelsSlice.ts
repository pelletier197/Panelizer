import type { Panel } from '../types/panel'
import { createPanel, defaultThickness, followGrain } from '../lib/panel'
import type { PanelPatch } from '../lib/resize'
import { rotatePanels } from '../lib/rotate'
import { findMaterial } from '../lib/materials'
import type { Slice } from './types'

/** How far (mm, along X) a duplicate or paste lands from its source, so the
 *  copy doesn't hide exactly behind the original. */
const COPY_OFFSET = 30

/** Nudge each new panel diagonally so freshly added parts don't stack exactly
 *  on top of one another and become impossible to click. */
const spawnOffset = (index: number): [number, number, number] => [index * 30, index * 30, 0]

/** Adding, changing and removing panels, and the in-app clipboard. */
export interface PanelsSlice {
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
}

export const panelsSlice: Slice<PanelsSlice> = (set, get, { commit, live, mapPanels, applyPatches }) => {
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

  return {
    clipboard: [],
    pasteCount: 0,

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
        // A cancelled resize puts the size back; an automatic grain goes back
        // with it.
        panels: get().panels.map((p) => (byId.has(p.id) ? followGrain(p, { ...p, ...byId.get(p.id)! }) : p)),
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
  }
}
