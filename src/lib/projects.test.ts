import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bundleAllProjects,
  bundleFilename,
  deleteProject,
  findProjectByName,
  importProjects,
  listProjects,
  loadProject,
  openInitialProject,
  parseBundle,
  saveProject,
} from './projects'
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

describe('findProjectByName', () => {
  it('finds the most recent project of that name, ignoring case and spaces', () => {
    saveProject('old', design({ name: 'Meuble salon' }), 1)
    saveProject('other', design({ name: 'Desk' }), 2)
    saveProject('new', design({ name: 'meuble salon ' }), 3)
    expect(findProjectByName('Meuble Salon')?.id).toBe('new')
  })

  it('finds nothing when no project has the name', () => {
    saveProject('a', design({ name: 'Desk' }), 1)
    expect(findProjectByName('Shelf')).toBeUndefined()
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

describe('backing up every project', () => {
  it('round-trips every project through one file, keeping names, content and order', () => {
    saveProject('a', design({ name: 'Bookshelf', panels: [panel()] }), 100)
    saveProject('b', design({ name: 'Wardrobe', kerf: 2.6 }), 200)
    const file = JSON.stringify(bundleAllProjects())

    store.clear()
    const items = parseBundle(file)!
    expect(importProjects(items)).toBe(2)
    const list = listProjects()
    expect(list.map((p) => [p.name, p.updatedAt])).toEqual([
      ['Wardrobe', 200],
      ['Bookshelf', 100],
    ])
    expect(loadProject(list[0].id)?.kerf).toBe(2.6)
    expect(loadProject(list[1].id)?.panels).toHaveLength(1)
  })

  it('imports alongside existing projects, never over them', () => {
    saveProject('a', design({ name: 'Mine' }), 100)
    const file = JSON.stringify(bundleAllProjects())
    importProjects(parseBundle(file)!)
    expect(listProjects().map((p) => p.name)).toEqual(['Mine', 'Mine'])
    expect(new Set(listProjects().map((p) => p.id)).size).toBe(2)
  })

  it('is not mistaken for a single design, and vice versa', () => {
    expect(parseBundle(JSON.stringify(serialize(design())))).toBeNull()
  })

  it('skips an unreadable project rather than failing the whole file', () => {
    const file = JSON.stringify({
      format: 'panelizer-projects',
      version: 1,
      projects: [{ updatedAt: 1, design: { nonsense: true } }, { updatedAt: 2, design: serialize(design({ name: 'Ok' })) }],
    })
    expect(parseBundle(file)!.map((p) => p.design.name)).toEqual(['Ok'])
  })

  it('names the backup after the day it was taken', () => {
    expect(bundleFilename(new Date(2026, 9, 29))).toBe('panelizer-projects-2026-10-29.json')
  })
})
