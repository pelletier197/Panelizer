import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDesignStore } from './designStore'
import { defaultMaterials } from '../lib/materials'
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

let saved: string[]
beforeEach(() => {
  saved = []
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: (_: string, v: string) => void saved.push(v),
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

  it('nudgeSelection moves the selection along one axis as one step', () => {
    useDesignStore.setState({ selectedIds: ['a', 'b'] })
    store().nudgeSelection(2, -5)
    expect(byId('a').position).toEqual([0, 0, -5])
    expect(byId('b').position).toEqual([0, 0, -5])
    expect(store().past).toHaveLength(1)
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
    store().selectInBox(['b', 'c'], false)
    expect(store().selectedIds).toEqual(['b'])
  })

  it('selectInBox extends the selection when additive', () => {
    useDesignStore.setState({ selectedIds: ['a'] })
    store().selectInBox(['b'], true)
    expect(store().selectedIds).toEqual(['a', 'b'])
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
