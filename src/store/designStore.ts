import { create } from 'zustand'
import type { Design } from '../lib/persistence'
import * as projects from '../lib/projects'
import { createTools, historySlice, pickDesign } from './history'
import { panelsSlice } from './panelsSlice'
import { selectionSlice } from './selectionSlice'
import { toolsSlice } from './toolsSlice'
import { documentSlice } from './documentSlice'
import { projectsSlice } from './projectsSlice'
import type { DesignState } from './types'

export type { DesignState } from './types'
export type { Tool, ToolPick, Gesture } from './toolsSlice'
export type { FieldHighlight, BoxSelectOp } from './selectionSlice'

/**
 * The one store: the open project's design, plus the transient state of
 * working on it. Built from slices, each in its own file — history (and the
 * shared ways every edit goes through it), panels, selection, viewport tools,
 * the rest of the document, and projects.
 */
const createDesignStore = () =>
  create<DesignState>((set, get) => {
    const initial = projects.openInitialProject()
    const tools = createTools(set, get)
    return {
      ...initial.design,
      ...historySlice(set, get, tools),
      ...panelsSlice(set, get, tools),
      ...selectionSlice(set, get, tools),
      ...toolsSlice(set, get, tools),
      ...documentSlice(set, get, tools),
      ...projectsSlice(initial.id)(set, get, tools),
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
