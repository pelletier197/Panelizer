import type { Design } from '../lib/persistence'
import { emptyDesign, DEFAULT_NAME } from '../lib/persistence'
import * as projects from '../lib/projects'
import { pickDesign } from './history'
import type { DesignState, Slice } from './types'

/** Which saved project is open, and switching between them. */
export interface ProjectsSlice {
  /** The open project's storage id (see lib/projects). Not part of the design:
   *  the same design can be saved under several ids. */
  projectId: string
  /** Switch to a saved project. Undo history starts afresh. Returns false if
   *  the project can't be read. */
  openProject: (id: string) => boolean
  /** Start a new project and switch to it — empty, keeping the current
   *  materials and settings, or holding `design` (an import, a shared link). */
  newProject: (design?: Design) => void
  /** Overwrite a saved project with `design` (a newer copy from a shared link)
   *  and switch to it. Undo history starts afresh. */
  replaceProject: (id: string, design: Design) => void
  /** Delete a saved project; deleting the open one switches to the most recent
   *  other project, or a new one. */
  deleteProject: (id: string) => void
}

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

/** The projects slice, starting on project `initialId`. */
export const projectsSlice =
  (initialId: string): Slice<ProjectsSlice> =>
  (set, get) => {
    // Make `id` (holding `design`) the open project.
    const switchTo = (id: string, design: Design) => {
      projects.setCurrentProject(id)
      set({ ...pickDesign(design), ...FRESH_SESSION, projectId: id })
    }

    return {
      projectId: initialId,

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

      replaceProject: (id, design) => {
        projects.saveProject(id, design)
        switchTo(id, design)
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
  }
