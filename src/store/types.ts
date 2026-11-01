import type { StoreApi } from 'zustand'
import type { Panel } from '../types/panel'
import type { Design } from '../lib/persistence'
import type { PanelPatch } from '../lib/resize'
import type { HistorySlice } from './history'
import type { PanelsSlice } from './panelsSlice'
import type { SelectionSlice } from './selectionSlice'
import type { ToolsSlice } from './toolsSlice'
import type { DocumentSlice } from './documentSlice'
import type { ProjectsSlice } from './projectsSlice'

/** The design document (see `Design` for its fields) plus transient UI state
 *  and the actions that change either, gathered from the slices below. */
export type DesignState = Design &
  HistorySlice &
  PanelsSlice &
  SelectionSlice &
  ToolsSlice &
  DocumentSlice &
  ProjectsSlice

export type SetState = StoreApi<DesignState>['setState']
export type GetState = StoreApi<DesignState>['getState']

/** The shared ways to change the design, built once by `history.ts` and
 *  handed to every slice so edits all land in the undo history the same way. */
export interface StoreTools {
  /** Change the design as one undo step (autosaved). */
  commit: (next: Partial<DesignState>) => void
  /** One frame of a drag: shown, but neither saved nor its own undo step. */
  live: (panels: Panel[]) => void
  /** The panels with `fn` applied to those whose id is in `ids`. */
  mapPanels: (ids: Iterable<string>, fn: (p: Panel) => Panel) => Panel[]
  /** The panels with each patch merged into its panel. */
  applyPatches: (patches: PanelPatch[]) => Panel[]
}

/** One part of the store: its state and actions, built with access to the
 *  whole store and the shared tools. */
export type Slice<T> = (set: SetState, get: GetState, tools: StoreTools) => T
