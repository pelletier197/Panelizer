import { isFinish, isHexColor, variantOf, type Finish } from './finishes'

/** A user-defined material: a name, and how it looks — a colour, and
 *  optionally a finish with a pattern (see `lib/finishes.ts`). Thickness is a
 *  property of the individual panel, not the material. */
export interface Material {
  id: string
  name: string
  /** `#rrggbb`. With a finish, it tints the pattern like a stain. */
  color: string
  /** Absent means paint: a flat colour, as materials had before finishes. */
  finish?: Finish
  /** The pattern within the finish (`oak`, `marble`…); absent means its first. */
  variant?: string
}

/** Colours new materials cycle through, so each new one reads apart. */
export const MATERIAL_COLORS = [
  '#d9b380', // plywood
  '#e2c48d', // birch
  '#c99f63', // oak
  '#b0805a', // walnut
  '#9aa0ab', // grey
  '#8fb0c9', // blue
  '#a7c99a', // green
  '#d59b9b', // red
]

/**
 * A material read from a file or link, made safe to use: a usable id, name
 * and colour, and a finish and variant only if they're ones we know. Returns
 * null when there is no material to speak of.
 */
export function sanitizeMaterial(value: unknown, index: number): Material | null {
  if (!value || typeof value !== 'object') return null
  const m = value as Record<string, unknown>
  if (typeof m.id !== 'string' || !m.id) return null
  const material: Material = {
    id: m.id,
    name: typeof m.name === 'string' ? m.name : 'Material',
    color: isHexColor(m.color) ? m.color : MATERIAL_COLORS[index % MATERIAL_COLORS.length],
  }
  if (isFinish(m.finish) && m.finish !== 'paint') {
    material.finish = m.finish
    const variant = variantOf(m.finish, typeof m.variant === 'string' ? m.variant : undefined)
    if (variant) material.variant = variant.id
  }
  return material
}

/** The one material every new design starts with. */
export const DEFAULT_MATERIAL: Material = {
  id: 'plywood',
  name: 'Plywood',
  color: MATERIAL_COLORS[0],
}

export const defaultMaterials = (): Material[] => [{ ...DEFAULT_MATERIAL }]

export function createMaterial(existingCount: number): Material {
  return {
    id: crypto.randomUUID(),
    name: 'New material',
    color: MATERIAL_COLORS[existingCount % MATERIAL_COLORS.length],
  }
}

export function findMaterial(materials: Material[], id: string): Material {
  return materials.find((m) => m.id === id) ?? materials[0] ?? DEFAULT_MATERIAL
}
