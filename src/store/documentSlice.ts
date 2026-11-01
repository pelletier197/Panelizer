import type { Material } from '../lib/materials'
import type { Stock } from '../lib/stock'
import type { Unit } from '../lib/units'
import type { CutStyle } from '../lib/nesting'
import { repairPrecision } from '../lib/repair'
import { createMaterial } from '../lib/materials'
import { createStock } from '../lib/stock'
import type { Slice } from './types'

/** Everything in the design but its panels: materials, sheet stock, units and
 *  cutlist settings, and the project's name. Each change is one undo step. */
export interface DocumentSlice {
  addMaterial: () => void
  updateMaterial: (id: string, patch: Partial<Material>) => void
  removeMaterial: (id: string) => void

  addStock: (materialId: string, thickness?: number) => void
  updateStock: (id: string, patch: Partial<Stock>) => void
  removeStock: (id: string) => void

  setUnit: (unit: Unit) => void
  /** Set the imperial working precision (fraction denominator). Snaps existing
   *  geometry to the new, coarser/finer grid too (via fixPrecision). */
  setPrecision: (precision: number) => void
  /** Switch the document unit AND convert the geometry onto the new unit's grid
   *  (snap sizes, close gaps). Lossy across systems (mm↔inch); the UI confirms
   *  first. One undo step. */
  convertUnit: (unit: Unit) => void
  /** Heal drift in the current unit: snap sizes to the exact grid and close
   *  hairline gaps at joints so parts add up exactly. One undo step. */
  fixPrecision: () => void
  setKerf: (mm: number) => void
  setMargin: (mm: number) => void
  setCutStyle: (style: CutStyle) => void
  /** Rename the project (one undo step, like any other edit). */
  setName: (name: string) => void
}

export const documentSlice: Slice<DocumentSlice> = (_set, get, { commit }) => ({
  addMaterial: () => {
    commit({ materials: [...get().materials, createMaterial(get().materials.length)] })
  },

  updateMaterial: (id, patch) => {
    commit({ materials: get().materials.map((m) => (m.id === id ? { ...m, ...patch } : m)) })
  },

  // Can't delete the last material; panels using a removed one fall back to
  // the first remaining material (thickness is unaffected).
  removeMaterial: (id) => {
    const remaining = get().materials.filter((m) => m.id !== id)
    if (remaining.length === 0) return
    const fallback = remaining[0].id
    const remap = <T extends { materialId: string }>(x: T) =>
      x.materialId === id ? { ...x, materialId: fallback } : x
    commit({
      materials: remaining,
      panels: get().panels.map(remap),
      stocks: get().stocks.map(remap),
    })
  },

  addStock: (materialId, thickness) => {
    commit({ stocks: [...get().stocks, createStock(materialId, thickness, get().unit)] })
  },

  updateStock: (id, patch) => {
    commit({ stocks: get().stocks.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  },

  removeStock: (id) => {
    commit({ stocks: get().stocks.filter((s) => s.id !== id) })
  },

  setUnit: (unit) => commit({ unit }),

  setPrecision: (precision) => {
    // Re-snap geometry onto the new precision grid so everything stays exact.
    commit({ precision, panels: repairPrecision(get().panels, get().unit, precision) })
  },

  convertUnit: (unit) => {
    // Snap all geometry onto the new unit's grid so values stay exact fractions
    // in the unit you're now working in, and close any gaps the snap opens.
    commit({ unit, panels: repairPrecision(get().panels, unit, get().precision) })
  },

  fixPrecision: () => {
    const { panels, unit, precision } = get()
    if (panels.length > 0) commit({ panels: repairPrecision(panels, unit, precision) })
  },
  setKerf: (kerf) => commit({ kerf: Math.max(0, kerf) }),
  setMargin: (margin) => commit({ margin: Math.max(0, margin) }),
  setCutStyle: (cutStyle) => commit({ cutStyle }),

  setName: (name) => commit({ name }),
})
