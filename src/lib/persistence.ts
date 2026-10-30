import type { Panel } from '../types/panel'
import { defaultGrain } from '../types/panel'
import type { Material } from './materials'
import type { Stock } from './stock'
import type { Unit } from './units'
import { DEFAULT_PRECISION } from './units'
import { defaultMaterials, findMaterial } from './materials'
import { DEFAULT_CUT_STYLE, type CutStyle } from './nesting'

const FORMAT = 'panelizer'
const VERSION = 1

/** Default saw kerf and sheet trim margin (mm), used for cutlist nesting. */
export const DEFAULT_KERF = 3
export const DEFAULT_MARGIN = 10

/** What a design is called until it's given a name. */
export const DEFAULT_NAME = 'Untitled project'

/** A full design: its name, panels, the materials they use, the sheet-good
 *  stock to nest them onto, cutlist settings, and the default display unit. */
export interface Design {
  /** The project's name — shown in the toolbar and the projects list, and used
   *  for the export filename. */
  name: string
  panels: Panel[]
  materials: Material[]
  stocks: Stock[]
  unit: Unit
  /** Imperial working precision (fraction denominator, e.g. 16 = 1/16"). */
  precision: number
  /** Saw blade width (mm) left between adjacent parts when nesting. */
  kerf: number
  /** Trim margin (mm) kept clear around the edge of each sheet. */
  margin: number
  /** How the cutlist lays parts out: saw-friendly straight cuts, or free. */
  cutStyle: CutStyle
}

/** On-disk / on-wire shape. Kept flat and versioned so older files can be
 *  migrated if the schema changes. */
export interface DesignFile extends Design {
  format: typeof FORMAT
  version: number
}

export function serialize({ name, panels, materials, stocks, unit, precision, kerf, margin, cutStyle }: Design): DesignFile {
  return { format: FORMAT, version: VERSION, name, unit, precision, kerf, margin, cutStyle, materials, stocks, panels }
}

/** A fresh, empty design with every setting at its default. */
export function emptyDesign(): Design {
  return {
    name: DEFAULT_NAME,
    panels: [],
    materials: defaultMaterials(),
    stocks: [],
    unit: 'mm',
    precision: DEFAULT_PRECISION,
    kerf: DEFAULT_KERF,
    margin: DEFAULT_MARGIN,
    cutStyle: DEFAULT_CUT_STYLE,
  }
}

/** Parse a design file by its shape, not a format tag: as long as it has a
 *  panels array we try to load it (so files from any past version / name import
 *  fine). Missing materials fall back to the default; a panel pointing at a
 *  missing material is remapped to a valid one; later-added fields (name, grain,
 *  stocks, precision, kerf, margin, cutStyle) are back-filled. Panel thickness is
 *  preserved as-is (it's a panel property, not the material's).
 *
 *  A file is untrusted input (a shared link especially), so fields that would
 *  break the geometry are checked: a panel whose size, position or axis isn't
 *  usable is dropped, and an unreadable setting falls back to its default.
 *  Throws only when the JSON is unreadable or has no panels array. */
export function parse(json: string): Design {
  const data = JSON.parse(json) as Partial<DesignFile>
  if (!Array.isArray(data.panels)) {
    throw new Error('This file is not a valid Panelizer design.')
  }

  const materials =
    Array.isArray(data.materials) && data.materials.length > 0
      ? data.materials
      : defaultMaterials()

  const panels = data.panels.filter(isUsablePanel).map((p) => {
    const panel: Panel = {
      ...p,
      id: typeof p.id === 'string' && p.id ? p.id : crypto.randomUUID(),
      name: typeof p.name === 'string' ? p.name : 'Panel',
      materialId: findMaterial(materials, p.materialId).id,
      grain: GRAINS.includes(p.grain) ? p.grain : defaultGrain(p.length, p.width),
    }
    // Corner radii are optional: keep four usable numbers, drop anything else
    // (the panel then simply has square corners).
    if (!isCornerRadii(p.corners)) delete panel.corners
    return panel
  })

  return {
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : DEFAULT_NAME,
    panels,
    materials,
    stocks: Array.isArray(data.stocks) ? data.stocks : [],
    unit: UNITS.includes(data.unit as Unit) ? (data.unit as Unit) : 'mm',
    precision: positiveOr(data.precision, DEFAULT_PRECISION),
    kerf: nonNegativeOr(data.kerf, DEFAULT_KERF),
    margin: nonNegativeOr(data.margin, DEFAULT_MARGIN),
    cutStyle: data.cutStyle === 'free' ? 'free' : DEFAULT_CUT_STYLE,
  }
}

const AXES: readonly unknown[] = ['x', 'y', 'z']
const GRAINS: readonly unknown[] = ['length', 'width', 'none']
const UNITS: readonly unknown[] = ['mm', 'cm', 'inch']

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const positiveOr = (v: unknown, fallback: number) => (isFiniteNumber(v) && v > 0 ? v : fallback)
const nonNegativeOr = (v: unknown, fallback: number) => (isFiniteNumber(v) && v >= 0 ? v : fallback)

const isCornerRadii = (v: unknown): v is [number, number, number, number] =>
  Array.isArray(v) && v.length === 4 && v.every((r) => isFiniteNumber(r) && r >= 0)

/** Whether a stored panel has the geometry the viewport and nesting rely on. */
function isUsablePanel(p: Partial<Panel> | null): p is Panel {
  return (
    typeof p === 'object' &&
    p !== null &&
    AXES.includes(p.normal) &&
    [p.length, p.width, p.thickness].every((v) => isFiniteNumber(v) && v > 0) &&
    Array.isArray(p.position) &&
    p.position.length === 3 &&
    p.position.every(isFiniteNumber)
  )
}

/** A filesystem-safe piece of a file name: lower-cased, with runs of anything
 *  but letters and digits turned into single dashes. Empty if nothing's left. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents: é → e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** A filesystem-safe file name for a design, after its name. */
export function designFilename(name: string): string {
  return `${slugify(name) || 'design'}.panelizer.json`
}

/** Trigger a browser download of some text or bytes as a file. */
export function downloadFile(data: string | Uint8Array, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Trigger a browser download of `data` as a pretty-printed JSON file. */
export function downloadJson(data: unknown, filename: string): void {
  downloadFile(JSON.stringify(data, null, 2), filename, 'application/json')
}

/** Trigger a browser download of the design as a `.panelizer.json` file named
 *  after it. */
export function downloadDesign(design: Design, filename = designFilename(design.name)): void {
  downloadJson(serialize(design), filename)
}
