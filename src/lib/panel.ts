import type { Panel } from '../types/panel'
import { defaultGrain } from '../types/panel'
import { DEFAULT_MATERIAL } from './materials'
import { isImperial, toMm, type Unit } from './units'

/** Default thickness for a new panel (mm). Freely editable per panel. */
export const DEFAULT_THICKNESS = 18

/** Standard panel thickness for the document unit: a clean 3/4" in imperial,
 *  18 mm in metric — so a fresh panel reads as a real stock thickness, not an
 *  odd rounding like 11/16". */
export function defaultThickness(unit: Unit): number {
  return isImperial(unit) ? toMm(0.75, 'inch') : DEFAULT_THICKNESS
}

/** Standard thin-stock thickness (backs, drawer bottoms): 1/4" or 6 mm. */
export function defaultThinThickness(unit: Unit): number {
  return isImperial(unit) ? toMm(0.25, 'inch') : 6
}

/** Build a panel with sensible defaults, applying any overrides. The generated
 *  `id` is always fresh and cannot be overridden, so this is also safe to use
 *  when cloning from an existing panel's fields. Grain defaults to the longer
 *  edge unless the overrides set it explicitly. */
export function createPanel(overrides: Partial<Panel> = {}): Panel {
  const base: Panel = {
    id: crypto.randomUUID(),
    name: 'Panel',
    normal: 'z',
    length: 600,
    width: 400,
    thickness: DEFAULT_THICKNESS,
    position: [0, 0, 0],
    materialId: DEFAULT_MATERIAL.id,
    grain: 'length',
  }
  const merged = { ...base, ...overrides, id: base.id }
  if (overrides.grain === undefined) merged.grain = defaultGrain(merged.length, merged.width)
  return merged
}

/**
 * Keep an automatic grain on the long edge after an edit. When an edit changes
 * a panel's length or width — a resize, a typed size — and its grain wasn't
 * set by hand, the grain moves to whichever edge is now the longer one, as
 * it would on a board cut to that size. Left alone: a grain that isn't
 * automatic (see `isAutoGrain`), and an edit that set the grain itself (a
 * quarter turn re-derives it).
 */
export function followGrain(before: Panel, after: Panel): Panel {
  if (!isAutoGrain(before) || after.grainSet || after.grain !== before.grain) return after
  if (after.length === before.length && after.width === before.width) return after
  const grain = defaultGrain(after.length, after.width)
  return grain === after.grain ? after : { ...after, grain }
}

/**
 * Whether a panel's grain is automatic: not set by hand, and on its longer
 * edge. Files from before `grainSet` existed don't say; a grain that runs
 * any other way there was a choice, and is kept as one.
 */
export const isAutoGrain = (p: Pick<Panel, 'grain' | 'grainSet' | 'length' | 'width'>): boolean =>
  !p.grainSet && p.grain !== 'none' && p.grain === defaultGrain(p.length, p.width)
