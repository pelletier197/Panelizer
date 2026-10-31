import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDesignStore } from './designStore'
import { defaultMaterials } from '../lib/materials'
import { emptyDesign } from '../lib/persistence'
import { listProjects } from '../lib/projects'
import type { Panel } from '../types/panel'

/**
 * The store's design-editing contract: batch edits are one undo step, hidden
 * panels stay out of every selection path, and autosave follows commits but
 * not live drag frames. Zustand runs outside React, so these drive the real
 * store directly.
 */

let seq = 0
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: 'Part',
  normal: 'z',
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  materialId: 'plywood',
  grain: 'length',
  ...over,
})

const store = () => useDesignStore.getState()
const byId = (id: string) => store().panels.find((p) => p.id === id)!

/** Designs written to a project slot, in order (index writes left out). */
let saved: string[]
let mem: Map<string, string>
beforeEach(() => {
  saved = []
  mem = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
      if (k.startsWith('panelizer.project.')) saved.push(v)
    },
    removeItem: (k: string) => void mem.delete(k),
  })
  useDesignStore.setState({
    panels: [panel({ id: 'a' }), panel({ id: 'b' }), panel({ id: 'c', hidden: true })],
    materials: defaultMaterials(),
    stocks: [],
    selectedIds: [],
    past: [],
    future: [],
    dragOrigin: null,
  })
  saved = [] // the reset itself is a design change; start counting after it
})

describe('batch edits', () => {
  it('updatePanels patches every target in one undo step', () => {
    store().updatePanels(['a', 'b'], { thickness: 12 })
    expect(byId('a').thickness).toBe(12)
    expect(byId('b').thickness).toBe(12)
    expect(store().past).toHaveLength(1)

    store().undo()
    expect(byId('a').thickness).toBe(18)
    expect(byId('b').thickness).toBe(18)
  })

  it('updatePanels with no ids records nothing', () => {
    store().updatePanels([], { thickness: 12 })
    expect(store().past).toHaveLength(0)
  })

  it('duplicatePanels copies each panel once and selects the copies', () => {
    store().duplicatePanels(['a', 'b'])
    const { panels, selectedIds, past } = store()
    expect(panels).toHaveLength(5)
    expect(selectedIds).toHaveLength(2)
    expect(selectedIds).not.toContain('a')
    expect(past).toHaveLength(1)
    expect(byId(selectedIds[0]).position[0]).toBe(30)
  })

  it('paste adds offset copies of what was copied, one step further each time', () => {
    useDesignStore.setState({ selectedIds: ['a'] })
    store().copySelection()
    store().paste()
    const first = store().selectedIds
    expect(first).toHaveLength(1)
    expect(byId(first[0]).position[0]).toBe(30)

    store().paste()
    const second = store().selectedIds
    expect(byId(second[0]).position[0]).toBe(60)
    expect(store().panels).toHaveLength(5)
    expect(store().past).toHaveLength(2)
  })

  it('paste uses the panels as they were when copied', () => {
    useDesignStore.setState({ selectedIds: ['a'] })
    store().copySelection()
    store().updatePanel('a', { length: 999 })
    store().paste()
    expect(byId(store().selectedIds[0]).length).toBe(600)
  })

  it('paste with nothing copied does nothing', () => {
    useDesignStore.setState({ clipboard: [] })
    store().paste()
    expect(store().past).toHaveLength(0)
  })

  it('rotateSelection turns the selection as one undo step', () => {
    useDesignStore.setState({ selectedIds: ['a', 'b'] })
    store().rotateSelection(0, 1)
    expect(byId('a').normal).toBe('y')
    expect(byId('b').normal).toBe('y')
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(byId('a').normal).toBe('z')
  })

  it('rotateSelection with nothing selected records nothing', () => {
    store().rotateSelection(1, 1)
    expect(store().past).toHaveLength(0)
  })

  it('removePanels drops panels and their selection together', () => {
    useDesignStore.setState({ selectedIds: ['a', 'b'] })
    store().removePanels(['a'])
    expect(store().panels.map((p) => p.id)).toEqual(['b', 'c'])
    expect(store().selectedIds).toEqual(['b'])
  })
})

describe('selection', () => {
  it('selectAll skips hidden panels', () => {
    store().selectAll()
    expect(store().selectedIds).toEqual(['a', 'b'])
  })

  it('invertSelection swaps among visible panels only', () => {
    useDesignStore.setState({ selectedIds: ['a'] })
    store().invertSelection()
    expect(store().selectedIds).toEqual(['b'])
  })

  it('selectInBox never picks a hidden panel', () => {
    store().selectInBox(['b', 'c'], 'replace')
    expect(store().selectedIds).toEqual(['b'])
  })

  it('selectInBox adds to the selection', () => {
    useDesignStore.setState({ selectedIds: ['a'] })
    store().selectInBox(['a', 'b'], 'add')
    expect(store().selectedIds).toEqual(['a', 'b'])
  })

  it('selectInBox removes from the selection', () => {
    useDesignStore.setState({ selectedIds: ['a', 'b'] })
    store().selectInBox(['b', 'c'], 'remove')
    expect(store().selectedIds).toEqual(['a'])
  })

  it('setBoxPreview skips an unchanged list', () => {
    store().setBoxPreview(['a'])
    const before = store().boxPreview
    store().setBoxPreview(['a'])
    expect(store().boxPreview).toBe(before)
  })
})

describe('history', () => {
  it('redo re-applies an undone edit, and a fresh edit clears redo', () => {
    store().updatePanel('a', { name: 'Side' })
    store().undo()
    expect(byId('a').name).toBe('Part')
    store().redo()
    expect(byId('a').name).toBe('Side')

    store().undo()
    store().updatePanel('b', { name: 'Top' })
    expect(store().future).toHaveLength(0)
  })

  it('a live drag plus its commit is a single undo step', () => {
    store().movePanelLive('a', [10, 0, 0])
    store().movePanelLive('a', [20, 0, 0])
    store().commitPanelsMove([{ id: 'a', position: [20, 0, 0] }])
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(byId('a').position).toEqual([0, 0, 0])
  })

  it('a live group resize plus its commit is a single undo step', () => {
    store().patchPanelsLive([
      { id: 'a', patch: { length: 650 } },
      { id: 'b', patch: { length: 650 } },
    ])
    expect(saved).toHaveLength(0)
    store().commitPanelPatches([
      { id: 'a', patch: { length: 650 } },
      { id: 'b', patch: { length: 650 } },
    ])
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(byId('a').length).toBe(600)
    expect(byId('b').length).toBe(600)
  })

  it('removing a material remaps its panels onto a remaining one', () => {
    useDesignStore.setState({
      materials: [...defaultMaterials(), { id: 'mdf', name: 'MDF', color: '#999' }],
    })
    store().updatePanel('a', { materialId: 'mdf' })
    store().removeMaterial('mdf')
    expect(byId('a').materialId).toBe('plywood')
  })
})

describe('autosave', () => {
  it('saves on commit', () => {
    store().updatePanel('a', { name: 'Side' })
    expect(saved).toHaveLength(1)
    expect(JSON.parse(saved[0]).panels[0].name).toBe('Side')
  })

  it('skips live drag frames and saves once on the drop', () => {
    store().movePanelLive('a', [10, 0, 0])
    store().movePanelLive('a', [20, 0, 0])
    expect(saved).toHaveLength(0)
    store().commitPanelsMove([{ id: 'a', position: [20, 0, 0] }])
    expect(saved).toHaveLength(1)
  })

  it('saves on undo, and not on a selection change', () => {
    store().updatePanel('a', { name: 'Side' })
    store().undo()
    expect(saved).toHaveLength(2)
    store().select('a')
    expect(saved).toHaveLength(2)
  })
})

describe('projects', () => {
  it('renames as an undoable, saved edit', () => {
    store().setName('Kitchen')
    expect(store().name).toBe('Kitchen')
    expect(JSON.parse(saved.at(-1)!).name).toBe('Kitchen')
    store().undo()
    expect(store().name).not.toBe('Kitchen')
  })

  it('a new project is empty, keeps the materials, and starts a fresh history', () => {
    store().updatePanel('a', { name: 'Side' })
    const before = store().projectId
    const materials = store().materials
    store().newProject()
    expect(store().projectId).not.toBe(before)
    expect(store().panels).toEqual([])
    expect(store().materials).toBe(materials)
    expect(store().past).toEqual([])
    expect(listProjects().map((p) => p.id)).toContain(store().projectId)
  })

  it('opening a project brings its design back, without re-saving it', () => {
    store().updatePanel('a', { name: 'Side' })
    const first = store().projectId
    store().newProject()
    const writes = saved.length
    expect(store().openProject(first)).toBe(true)
    expect(byId('a').name).toBe('Side')
    expect(store().past).toEqual([])
    expect(saved.length).toBe(writes)
  })

  it('a new project can hold an imported design', () => {
    store().newProject({ ...emptyDesign(), name: 'Imported', panels: [panel({ id: 'x' })] })
    expect(store().name).toBe('Imported')
    expect(store().panels.map((p) => p.id)).toEqual(['x'])
  })

  it('deleting the open project switches to another one', () => {
    store().updatePanel('a', { name: 'Side' })
    const first = store().projectId
    store().newProject()
    const second = store().projectId
    store().deleteProject(second)
    expect(store().projectId).toBe(first)
    expect(listProjects().map((p) => p.id)).not.toContain(second)
  })

  it('refuses to open a project that is gone', () => {
    expect(store().openProject('missing')).toBe(false)
  })
})

describe('grain follows the long edge', () => {
  it('moves an automatic grain when a resize makes the other edge the longer one', () => {
    // a: 600 × 400, grain along its length.
    store().updatePanels(['a'], { length: 300, width: 1200 })
    expect(byId('a').grain).toBe('width')
    store().updatePanels(['a'], { length: 1500 })
    expect(byId('a').grain).toBe('length')
  })

  it('follows a live resize drag, and goes back with it when cancelled', () => {
    store().patchPanelsLive([{ id: 'a', patch: { width: 900 } }])
    expect(byId('a').grain).toBe('width')
    store().restorePanels([{ id: 'a', patch: { width: 400 } }])
    expect(byId('a').grain).toBe('length')
  })

  it('leaves a grain set by hand where it was put', () => {
    store().updatePanels(['a'], { grain: 'width', grainSet: true })
    store().updatePanels(['a'], { length: 2000 })
    expect(byId('a').grain).toBe('width')
  })

  it('leaves "no grain" alone', () => {
    store().updatePanels(['a'], { grain: 'none', grainSet: true })
    store().updatePanels(['a'], { width: 2000 })
    expect(byId('a').grain).toBe('none')
  })

  it('takes an edit that sets the grain itself as it is', () => {
    // As a quarter turn does: new size and the grain it re-derived.
    store().updatePanels(['a'], { length: 400, width: 600, grain: 'width' })
    expect(byId('a').grain).toBe('width')
  })
})

describe('grain from older files', () => {
  it('keeps a grain on the short edge, as the choice it was', () => {
    useDesignStore.setState({ panels: [panel({ id: 'old', length: 800, width: 260, grain: 'width' })] })
    store().updatePanels(['old'], { length: 900 })
    expect(byId('old').grain).toBe('width')
  })
})
