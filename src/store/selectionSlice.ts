import type { Panel } from '../types/panel'
import type { Slice } from './types'

/** A panel-editor field the viewport should point at: a size field (the edge
 *  it changes) or a position field (the axis it moves along). */
export type FieldHighlight =
  | { kind: 'size'; field: 'length' | 'width' | 'thickness' }
  | { kind: 'position'; axis: 0 | 1 | 2 }
  | { kind: 'corner'; index: 0 | 1 | 2 | 3 }

/** How a box-select combines with the existing selection. */
export type BoxSelectOp = 'add' | 'remove' | 'replace'

/** Which panels are selected, and what the viewport lights up as the pointer
 *  moves over the editor and the parts list. All transient. */
export interface SelectionSlice {
  /** Selected panels. Empty = nothing selected; one id = the classic single
   *  selection; several = a multi-selection (Shift+click) that moves together.
   *  The last id is the "primary" — it carries the move gizmo. */
  selectedIds: string[]
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
  setBoxKeyHeld: (held: boolean) => void
  /** Where the selection would land if the hovered rotate button were
   *  pressed, drawn as ghosts in the viewport. Empty when nothing is hovered.
   *  Transient UI state — never part of the design. */
  rotatePreview: Panel[]
  setRotatePreview: (panels: Panel[]) => void
  /** The panel-editor field under the pointer, and the one in focus, so the
   *  viewport can light up what it changes: a size field's edge, or a position
   *  field's axis. The hovered one wins, so pointing at a field while typing in
   *  another shows the one pointed at, then falls back. Transient UI state. */
  fieldHover: FieldHighlight | null
  fieldFocus: FieldHighlight | null
  setFieldHighlight: (source: 'hover' | 'focus', highlight: FieldHighlight | null) => void
  /** Apply a box-select: `add` the caught panels to the selection, `remove`
   *  them from it, or `replace` it. Hidden panels are never selected. */
  selectInBox: (ids: string[], op: BoxSelectOp) => void
  /** Select every visible panel. */
  selectAll: () => void
  /** Swap the selection for every visible panel that isn't in it. */
  invertSelection: () => void
  select: (id: string | null) => void
  /** One-shot guard so a resize drag-release doesn't select the panel under
   *  the cursor. Internal. */
  suppressSelect: boolean
  /** Select from a click in the 3D scene — no-ops once if a resize drag just
   *  armed suppression, so releasing a handle doesn't select the panel under it.
   *  `additive` (Shift+click) toggles the panel in/out of the current selection
   *  instead of replacing it. */
  sceneSelect: (id: string, additive?: boolean) => void
  /** Swallow the next scene-select (the click synthesised when a drag ends). */
  armSelectSuppression: () => void
}

/** Whether two id lists are the same, in order. */
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

export const selectionSlice: Slice<SelectionSlice> = (set, get) => {
  const visibleIds = () => get().panels.filter((p) => !p.hidden).map((p) => p.id)

  return {
    selectedIds: [],
    boxPreview: [],
    hoverIds: [],
    boxKeyHeld: false,
    rotatePreview: [],
    fieldHover: null,
    fieldFocus: null,
    suppressSelect: false,

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
      if (!sameIds(get().hoverIds, hoverIds)) set({ hoverIds })
    },

    // Called on every pointer move; skip the re-render when nothing changed.
    setBoxPreview: (boxPreview) => {
      if (!sameIds(get().boxPreview, boxPreview)) set({ boxPreview })
    },

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
  }
}
