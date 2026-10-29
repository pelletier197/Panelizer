import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteProject, listProjects, loadProject, openInitialProject, saveProject } from './projects'
import { emptyDesign, serialize, type Design } from './persistence'
import type { Panel } from '../types/panel'

let seq = 0
const panel = (): Panel => ({
  id: `p${seq++}`,
  name: 'Part',
  normal: 'z',
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  materialId: 'plywood',
  grain: 'length',
})

const design = (over: Partial<Design> = {}): Design => ({ ...emptyDesign(), ...over })

/** In-memory localStorage stand-in; `full` makes every write throw. */
let store: Map<string, string>
let full = false
beforeEach(() => {
  store = new Map()
  full = false
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new Error('QuotaExceededError')
      store.set(k, v)
    },
    removeItem: (k: string) => void store.delete(k),
  })
})

describe('saving and listing', () => {
  it('lists saved projects, most recently edited first', () => {
    saveProject('a', design({ name: 'Bookshelf' }), 100)
    saveProject('b', design({ name: 'Wardrobe', panels: [panel(), panel()] }), 200)
    expect(listProjects().map((p) => [p.name, p.panelCount])).toEqual([
      ['Wardrobe', 2],
      ['Bookshelf', 0],
    ])
  })

  it('re-saving a project updates its entry instead of adding another', () => {
    saveProject('a', design({ name: 'Draft' }), 100)
    saveProject('a', design({ name: 'Final' }), 300)
    expect(listProjects()).toEqual([{ id: 'a', name: 'Final', updatedAt: 300, panelCount: 0 }])
  })

  it('round-trips a design', () => {
    const d = design({ name: 'Desk', panels: [panel()], kerf: 2.6 })
    saveProject('a', d)
    expect(loadProject('a')).toMatchObject({ name: 'Desk', kerf: 2.6, panels: d.panels })
  })

  it('loads nothing for a missing or corrupt project', () => {
    expect(loadProject('nope')).toBeNull()
    store.set('panelizer.project.bad', '{not json')
    expect(loadProject('bad')).toBeNull()
  })

  it('deletes a project and its entry', () => {
    saveProject('a', design())
    saveProject('b', design())
    deleteProject('a')
    expect(loadProject('a')).toBeNull()
    expect(listProjects().map((p) => p.id)).toEqual(['b'])
  })

  it('ignores a corrupt index rather than throwing', () => {
    store.set('panelizer.projects', '{"oops":1}')
    expect(listProjects()).toEqual([])
  })

  it('reports a save that storage refused', () => {
    full = true
    expect(saveProject('a', design())).toBe(false)
  })
})

describe('openInitialProject', () => {
  it('reopens the project that was open last time', () => {
    saveProject('a', design({ name: 'A' }), 100)
    saveProject('b', design({ name: 'B' }), 200)
    store.set('panelizer.currentProject', 'a')
    expect(openInitialProject().design.name).toBe('A')
  })

  it('falls back to the most recent project when the last one is gone', () => {
    saveProject('a', design({ name: 'A' }), 100)
    saveProject('b', design({ name: 'B' }), 200)
    store.set('panelizer.currentProject', 'deleted')
    const { id, design: d } = openInitialProject()
    expect(id).toBe('b')
    expect(d.name).toBe('B')
  })

  it('starts a new, listed project when there are none', () => {
    const { id, design: d } = openInitialProject(500)
    expect(d.panels).toEqual([])
    expect(listProjects()).toEqual([{ id, name: d.name, updatedAt: 500, panelCount: 0 }])
  })

  it('moves the old single autosave into a project, without losing it', () => {
    const legacy = design({ panels: [panel()], kerf: 4 })
    store.set('panelizer.autosave', JSON.stringify(serialize(legacy)))
    const { design: d } = openInitialProject()
    expect(d.panels).toHaveLength(1)
    expect(d.kerf).toBe(4)
    expect(store.has('panelizer.autosave')).toBe(false)
    expect(listProjects()).toHaveLength(1)
  })

  it('keeps the old autosave when it cannot be moved', () => {
    store.set('panelizer.autosave', JSON.stringify(serialize(design({ panels: [panel()] }))))
    full = true
    openInitialProject()
    expect(store.has('panelizer.autosave')).toBe(true)
  })
})
