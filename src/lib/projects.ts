import { emptyDesign, parse, serialize, type Design } from './persistence'

/**
 * Named projects, kept in the browser's localStorage.
 *
 * Each project's design is stored under its own key, and a small index lists
 * them all (name, last edit, panel count) so the projects menu can show the
 * list without parsing every design. A separate key remembers which project
 * was open, so a reload comes back to it.
 *
 * Storage is best-effort throughout: it can be full, blocked, or cleared by the
 * browser, so every read falls back and every write is allowed to fail. That
 * is also why the UI keeps pointing people at Export for anything they care
 * about.
 */

const INDEX_KEY = 'panelizer.projects'
const CURRENT_KEY = 'panelizer.currentProject'
/** Where the single autosaved design lived before projects existed. */
const LEGACY_KEY = 'panelizer.autosave'
const projectKey = (id: string) => `panelizer.project.${id}`

export interface ProjectEntry {
  id: string
  name: string
  /** Last saved, ms since the epoch. */
  updatedAt: number
  panelCount: number
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Returns whether the write took. */
function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Unavailable storage: nothing to remove.
  }
}

const isEntry = (e: unknown): e is ProjectEntry =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as ProjectEntry).id === 'string' &&
  typeof (e as ProjectEntry).name === 'string' &&
  typeof (e as ProjectEntry).updatedAt === 'number'

/** Every saved project, most recently edited first. */
export function listProjects(): ProjectEntry[] {
  try {
    const data = JSON.parse(read(INDEX_KEY) ?? '[]') as unknown
    if (!Array.isArray(data)) return []
    return data
      .filter(isEntry)
      .map((e) => ({ ...e, panelCount: typeof e.panelCount === 'number' ? e.panelCount : 0 }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function writeIndex(entries: ProjectEntry[]): void {
  write(INDEX_KEY, JSON.stringify(entries))
}

/** A project's design, or null if it's missing or unreadable. */
export function loadProject(id: string): Design | null {
  const raw = read(projectKey(id))
  if (!raw) return null
  try {
    return parse(raw)
  } catch {
    return null
  }
}

/** Save a project's design and bring its index entry up to date. Returns
 *  whether the design was stored (false when storage is full or blocked). */
export function saveProject(id: string, design: Design, now = Date.now()): boolean {
  if (!write(projectKey(id), JSON.stringify(serialize(design)))) return false
  const entry: ProjectEntry = { id, name: design.name, updatedAt: now, panelCount: design.panels.length }
  writeIndex([entry, ...listProjects().filter((e) => e.id !== id)])
  return true
}

export function deleteProject(id: string): void {
  remove(projectKey(id))
  writeIndex(listProjects().filter((e) => e.id !== id))
  if (read(CURRENT_KEY) === id) remove(CURRENT_KEY)
}

export function setCurrentProject(id: string): void {
  write(CURRENT_KEY, id)
}

export function newProjectId(): string {
  return crypto.randomUUID()
}

/**
 * Move the pre-projects autosave into a project of its own, once. The old key
 * is only removed after the new copy is safely written, so a full or blocked
 * storage never loses it.
 */
function migrateLegacyAutosave(now: number): void {
  const raw = read(LEGACY_KEY)
  if (!raw) return
  let design: Design
  try {
    design = parse(raw)
  } catch {
    remove(LEGACY_KEY) // unreadable either way
    return
  }
  const id = newProjectId()
  if (saveProject(id, design, now)) {
    if (!read(CURRENT_KEY)) setCurrentProject(id)
    remove(LEGACY_KEY)
  }
}

/**
 * The project to open at startup: the one open last time, else the most
 * recently edited, else a new empty one (saved straight away so it's listed).
 */
export function openInitialProject(now = Date.now()): { id: string; design: Design } {
  migrateLegacyAutosave(now)

  const candidates = [read(CURRENT_KEY), ...listProjects().map((e) => e.id)].filter(
    (id): id is string => id !== null,
  )
  for (const id of candidates) {
    const design = loadProject(id)
    if (design) {
      setCurrentProject(id)
      return { id, design }
    }
  }

  const id = newProjectId()
  const design = emptyDesign()
  saveProject(id, design, now)
  setCurrentProject(id)
  return { id, design }
}
