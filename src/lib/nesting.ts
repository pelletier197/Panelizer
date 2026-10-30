import type { Panel } from '../types/panel'
import type { Material } from './materials'
import type { Stock } from './stock'
import { findMaterial } from './materials'
import { hasRounding, sheetCornerRadii, type CornerRadii } from './rounding'

/** One part placed on a sheet. Coordinates are mm from the sheet's top-left
 *  corner (margin already included); `w`/`h` are the footprint on the sheet. */
export interface Placement {
  panelId: string
  name: string
  x: number
  y: number
  w: number
  h: number
  /** True if the part is turned 90° from its as-drawn orientation. */
  rotated: boolean
  /** Corner radii (mm) as the part lies on the sheet, in screen order
   *  [top-left, top-right, bottom-right, bottom-left]. Absent when square. */
  corners?: CornerRadii
}

/** One physical sheet with the parts packed onto it. Sheets in a group may be
 *  different sizes (a full sheet, an offcut, …), so each carries its own size. */
export interface SheetLayout {
  index: number // 1-based within its group
  length: number
  width: number
  placements: Placement[]
  /** Sum of placed part areas (mm²) — used vs the sheet area for waste. */
  usedArea: number
}

/** All sheets cut for one material + thickness (possibly from several stock
 *  sizes). */
export interface StockGroup {
  key: string
  materialName: string
  color: string
  thickness: number
  sheets: SheetLayout[]
}

export interface UnplacedPart {
  panelId: string
  name: string
  /** `no-stock`: no sheet of this material + thickness exists at all.
   *  `too-big`: larger than every sheet of this material + thickness.
   *  `grain-locked`: would fit a sheet turned 90°, but its grain forbids it.
   *  `no-space`: would fit, but the available sheet quantity ran out. */
  reason: 'no-stock' | 'too-big' | 'grain-locked' | 'no-space'
  /** The material + thickness the part needs — so the UI can offer to add
   *  matching stock in one click. */
  materialId: string
  materialName: string
  thickness: number
}

export interface CutlistResult {
  groups: StockGroup[]
  unplaced: UnplacedPart[]
}

/**
 * How parts may be laid out on a sheet.
 * - `guillotine` (saw-friendly): every cut runs straight across the piece it
 *   cuts, edge to edge — what a table saw, track saw or panel saw can do.
 * - `free`: parts may interlock wherever they fit tightest. Less waste, but
 *   some layouts need a CNC or plunge cuts.
 */
export type CutStyle = 'guillotine' | 'free'

export const DEFAULT_CUT_STYLE: CutStyle = 'guillotine'

interface Footprint {
  w: number
  h: number
  rotated: boolean
}

/** The footprint orientations a part may take on the sheet. Sheet grain runs
 *  along the sheet length (X). A grained part must keep its grain edge along X,
 *  so it has one orientation; a grain-free part can also turn 90°. */
function footprints(panel: Panel): Footprint[] {
  const { length: l, width: w, grain } = panel
  if (grain === 'length') return [{ w: l, h: w, rotated: false }]
  if (grain === 'width') return [{ w: w, h: l, rotated: true }]
  return [
    { w: l, h: w, rotated: false },
    { w: w, h: l, rotated: true },
  ]
}

/** Whether a part fits an empty usable area in at least one allowed orientation. */
function fitsUsable(panel: Panel, uL: number, uW: number): boolean {
  return footprints(panel).some((f) => f.w <= uL && f.h <= uW)
}

/** Whether a part would fit an empty usable area if its grain allowed turning. */
function fitsTurned(panel: Panel, uL: number, uW: number): boolean {
  return fitsUsable({ ...panel, grain: 'none' }, uL, uW)
}

// ---- Bins and free space --------------------------------------------------
//
// Each sheet is a bin whose empty space is tracked as a list of free
// rectangles. A part goes in the free rect with the tightest fit (best
// short-side leftover); how the leftover is carved up is what separates the
// two styles:
//
// - MaxRects (`free`) keeps every *maximal* free rectangle, overlapping, and
//   splits all of them around each placement. Tightest packing, but parts can
//   end up interlocked so no single straight cut separates them.
// - Guillotine (`guillotine`) keeps disjoint free rectangles and splits only
//   the one used, with one straight cut across it. Each sheet is then a tree
//   of edge-to-edge cuts, which is exactly what a saw can do.
//
// Kerf (saw width) is handled by reserving `part + kerf` on the right/bottom of
// each placement, and giving the bin an extra `kerf` of usable space, so parts
// keep a blade gap between them while still sitting flush to the margins.

interface FreeRect {
  x: number
  y: number
  w: number
  h: number
}

interface Bin {
  length: number
  width: number
  free: FreeRect[]
  placements: Placement[]
  usedArea: number
}

const area = (l: number, w: number) => l * w

/** `a` fully contains `b`. */
function contains(a: FreeRect, b: FreeRect): boolean {
  return a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h
}

/** The parts of `free` left uncovered after `used` is placed over it (up to 4
 *  rectangles). If they don't overlap, `free` is returned unchanged. */
function splitFree(free: FreeRect, used: FreeRect): FreeRect[] {
  const noOverlap =
    used.x >= free.x + free.w ||
    used.x + used.w <= free.x ||
    used.y >= free.y + free.h ||
    used.y + used.h <= free.y
  if (noOverlap) return [free]

  const pieces: FreeRect[] = []
  if (used.y > free.y) pieces.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y })
  if (used.y + used.h < free.y + free.h)
    pieces.push({ x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - (used.y + used.h) })
  if (used.x > free.x) pieces.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h })
  if (used.x + used.w < free.x + free.w)
    pieces.push({ x: used.x + used.w, y: free.y, w: free.x + free.w - (used.x + used.w), h: free.h })
  return pieces
}

/** A chosen spot for a part: where it goes, at what footprint, and how much of
 *  the free rectangle it reserves once the saw gap is added. */
interface Fit {
  rect: FreeRect
  /** Reserved footprint — the part plus a kerf on the right/bottom. */
  reservedW: number
  reservedH: number
  w: number
  h: number
  rotated: boolean
}

/**
 * The best spot for a part in this bin, by best-short-side-fit: the free
 * rectangle that leaves the smallest leftover on its shorter side, ties broken
 * by the longer side. Returns null when no orientation fits anywhere.
 */
function findBestFit(bin: Bin, panel: Panel, kerf: number): Fit | null {
  let best: Fit | null = null
  let bestShort = Infinity
  let bestLong = Infinity

  for (const f of footprints(panel)) {
    const reservedW = f.w + kerf
    const reservedH = f.h + kerf
    for (const fr of bin.free) {
      if (reservedW > fr.w || reservedH > fr.h) continue
      const leftoverW = fr.w - reservedW
      const leftoverH = fr.h - reservedH
      const short = Math.min(leftoverW, leftoverH)
      const long = Math.max(leftoverW, leftoverH)
      if (short < bestShort || (short === bestShort && long < bestLong)) {
        bestShort = short
        bestLong = long
        best = { rect: fr, reservedW, reservedH, w: f.w, h: f.h, rotated: f.rotated }
      }
    }
  }

  return best
}

/** How a packer turns the free space around a placement into new free space. */
type Carve = (bin: Bin, fit: Fit) => void

/** MaxRects: split every free rect the placement overlaps, then drop the ones
 *  another contains. */
const carveMaxRects: Carve = (bin, fit) => {
  const used: FreeRect = { x: fit.rect.x, y: fit.rect.y, w: fit.reservedW, h: fit.reservedH }
  const split = bin.free.flatMap((fr) => splitFree(fr, used))
  bin.free = split.filter((r, i) => !split.some((o, j) => j !== i && contains(o, r)))
}

/**
 * Guillotine: one straight cut across the used rect separates the part's row
 * (or column) from the rest; the leftover beside the part becomes a second
 * rect. `shorter` makes that first cut along the axis with less leftover (it
 * keeps the bigger offcut whole), `longer` the other way — neither wins
 * everywhere, so the search tries both.
 */
const carveGuillotine =
  (rule: 'shorter' | 'longer'): Carve =>
  (bin, fit) => {
    const fr = fit.rect
    const leftoverW = fr.w - fit.reservedW
    const leftoverH = fr.h - fit.reservedH
    // Cut across the full width below the part, or the full height beside it.
    const cutAcross = rule === 'shorter' ? leftoverW <= leftoverH : leftoverW > leftoverH
    const beside: FreeRect = cutAcross
      ? { x: fr.x + fit.reservedW, y: fr.y, w: leftoverW, h: fit.reservedH }
      : { x: fr.x + fit.reservedW, y: fr.y, w: leftoverW, h: fr.h }
    const below: FreeRect = cutAcross
      ? { x: fr.x, y: fr.y + fit.reservedH, w: fr.w, h: leftoverH }
      : { x: fr.x, y: fr.y + fit.reservedH, w: fit.reservedW, h: leftoverH }
    bin.free = [...bin.free.filter((r) => r !== fr), beside, below].filter((r) => r.w > 0 && r.h > 0)
  }

/** Record a placement and carve its reserved footprint out of the free space. */
function commitPlacement(bin: Bin, panel: Panel, fit: Fit, margin: number, carve: Carve): void {
  carve(bin, fit)
  bin.placements.push({
    panelId: panel.id,
    name: panel.name,
    x: margin + fit.rect.x,
    y: margin + fit.rect.y,
    w: fit.w,
    h: fit.h,
    rotated: fit.rotated,
    // The packing works on the part's rectangle; rounding only changes how
    // it's drawn (and cut) within it.
    ...(hasRounding(panel) && { corners: sheetCornerRadii(panel, fit.rotated) }),
  })
  bin.usedArea += panel.length * panel.width
}

/** Place a part in a bin using best-short-side-fit. Returns true if it fit. */
function placeInBin(bin: Bin, panel: Panel, kerf: number, margin: number, carve: Carve): boolean {
  const fit = findBestFit(bin, panel, kerf)
  if (!fit) return false
  commitPlacement(bin, panel, fit, margin, carve)
  return true
}

/** Stock matches a group's thickness within this tolerance (mm). Exact float
 *  equality is too brittle across unit rounding: an "11/16" sheet (17.4625) and
 *  an 18 mm panel look identical to the user and should nest together, so the
 *  tolerance spans that ~0.54 mm gap — but stays under the ~1.05 mm gap to the
 *  next real thickness (3/4" = 19.05 mm) so distinct stock isn't merged. */
const THICKNESS_TOL = 0.8

export interface CutlistOptions {
  style?: CutStyle
}

/**
 * Nest the design's panels onto the available stock, honouring kerf (gap
 * between parts) and margin (clear border).
 *
 * Panels are grouped by the stock they can be cut from — same material, and a
 * thickness within {@link THICKNESS_TOL} — so parts a hair apart in thickness
 * share sheets, and stock quantities are counted once across the whole design:
 * the packer never invents sheets beyond what's available. Parts that can't be
 * placed are reported as unplaced (see {@link UnplacedPart} for the reasons).
 *
 * Within a group, parts fill already-open sheets when they can, and when a new
 * sheet is needed the **smallest** stock that fits is opened (using up offcuts
 * first). Several part orders (and, for saw-friendly layouts, both cut-split
 * rules) are tried and the layout using the least sheet area is kept — a cheap
 * search that often saves a sheet over any single heuristic.
 */
export function generateCutlist(
  panels: Panel[],
  materials: Material[],
  stocks: Stock[],
  kerf: number,
  margin: number,
  { style = DEFAULT_CUT_STYLE }: CutlistOptions = {},
): CutlistResult {
  const groups: StockGroup[] = []
  const unplaced: UnplacedPart[] = []
  // Shared by every group: two groups that can use the same stock draw from
  // one quantity, never one each.
  const remaining = new Map(stocks.map((s) => [s.id, s.quantity == null ? Infinity : s.quantity]))

  for (const group of groupByStock(panels, stocks)) {
    const material = findMaterial(materials, group.materialId)

    const report = (panel: Panel, reason: UnplacedPart['reason']) =>
      unplaced.push({
        panelId: panel.id,
        name: panel.name,
        reason,
        materialId: group.materialId,
        materialName: material.name,
        thickness: group.thickness,
      })

    if (group.stocks.length === 0) {
      for (const panel of group.panels) report(panel, 'no-stock')
      continue
    }

    const packed = bestPacking(group.panels, group.stocks, remaining, kerf, margin, style)
    for (const [id, left] of packed.remaining) remaining.set(id, left)
    for (const { panel, reason } of packed.unplaced) report(panel, reason)

    // A group with nothing placed (every part too big, say) has no diagram to
    // show; its parts are already reported above.
    if (packed.bins.length === 0) continue

    groups.push({
      key: group.key,
      materialName: material.name,
      color: material.color,
      thickness: group.thickness,
      sheets: packed.bins.map((b, i) => ({
        index: i + 1,
        length: b.length,
        width: b.width,
        placements: b.placements,
        usedArea: b.usedArea,
      })),
    })
  }

  return { groups, unplaced }
}

/** Parts that are cut from the same stock: one material, and the same set of
 *  matching sheets (empty when nothing matches). */
interface PanelGroup {
  key: string
  materialId: string
  /** The thickness shown for the group — its first part's. */
  thickness: number
  stocks: Stock[]
  panels: Panel[]
}

/** Group panels by the stock they can be cut from. Keying on the matching
 *  stock (not the exact thickness) is what lets an 18 mm part and one stored as
 *  18.0000001 — or an 11/16" part — share a sheet. Parts with no matching stock
 *  group by material and thickness, for the "missing stock" report. */
function groupByStock(panels: Panel[], stocks: Stock[]): PanelGroup[] {
  const byKey = new Map<string, PanelGroup>()

  for (const panel of panels) {
    const matching = stocks.filter(
      (s) => s.materialId === panel.materialId && Math.abs(s.thickness - panel.thickness) < THICKNESS_TOL,
    )
    const key =
      matching.length > 0
        ? `${panel.materialId}#${matching.map((s) => s.id).sort().join(',')}`
        : `${panel.materialId}@${Math.round(panel.thickness * 100) / 100}`
    const group = byKey.get(key)
    if (group) group.panels.push(panel)
    else byKey.set(key, { key, materialId: panel.materialId, thickness: panel.thickness, stocks: matching, panels: [panel] })
  }

  return [...byKey.values()]
}

/** Stock inventory entry: one stock size and how many sheets remain to open. */
interface Slot {
  stock: Stock
  uL: number
  uW: number
  remaining: number // Infinity when the stock quantity is unlimited (null)
}

/** The stock available to a group, smallest sheet first — so offcuts and small
 *  sheets are opened before full ones, and a new sheet is always the smallest
 *  that fits. */
function buildInventory(matching: Stock[], remaining: Map<string, number>, margin: number): Slot[] {
  return matching
    .map((stock) => ({
      stock,
      uL: stock.length - 2 * margin,
      uW: stock.width - 2 * margin,
      remaining: remaining.get(stock.id) ?? 0,
    }))
    .sort((a, b) => area(a.stock.length, a.stock.width) - area(b.stock.length, b.stock.width))
}

interface PackResult {
  bins: Bin[]
  unplaced: { panel: Panel; reason: UnplacedPart['reason'] }[]
  /** Each stock's quantity left after this packing. */
  remaining: Map<string, number>
}

/** Part orders tried by the search. The first is the long-standing default
 *  and wins ties, so a layout only changes when another order is strictly
 *  better. */
const ORDERS: ((a: Panel, b: Panel) => number)[] = [
  (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width), // longest side
  (a, b) => b.length * b.width - a.length * a.width, // area
  (a, b) => b.length + b.width - (a.length + a.width), // perimeter
  (a, b) => Math.min(b.length, b.width) - Math.min(a.length, a.width), // shortest side
]

/** `a` sorts strictly before `b`, comparing element by element. */
function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]
  return false
}

/**
 * Pack one group every way the search allows and keep the best: fewest
 * unplaced parts, then least total sheet area opened (what you pay for), then
 * fewest sheets.
 */
function bestPacking(
  panels: Panel[],
  stocks: Stock[],
  remaining: Map<string, number>,
  kerf: number,
  margin: number,
  style: CutStyle,
): PackResult {
  const carves: Carve[] =
    style === 'guillotine' ? [carveGuillotine('shorter'), carveGuillotine('longer')] : [carveMaxRects]

  let best: PackResult | null = null
  let bestScore: number[] = []
  for (const carve of carves) {
    for (const order of ORDERS) {
      const result = packGroup([...panels].sort(order), buildInventory(stocks, remaining, margin), kerf, margin, carve)
      const score = [
        result.unplaced.length,
        result.bins.reduce((sum, b) => sum + area(b.length, b.width), 0),
        result.bins.length,
      ]
      if (!best || lexLess(score, bestScore)) {
        best = result
        bestScore = score
      }
    }
  }
  return best!
}

/**
 * Pack one group's panels, in the given order, onto its inventory: fill
 * already-open sheets (smallest first) before opening a new sheet of the
 * smallest stock that fits. Consumes `inventory` quantities as sheets are
 * opened, so the packer never invents stock that isn't available.
 */
function packGroup(panels: Panel[], inventory: Slot[], kerf: number, margin: number, carve: Carve): PackResult {
  const bins: Bin[] = []
  const unplaced: PackResult['unplaced'] = []

  for (const panel of panels) {
    if (!inventory.some((s) => fitsUsable(panel, s.uL, s.uW))) {
      const turnable = inventory.some((s) => fitsTurned(panel, s.uL, s.uW))
      unplaced.push({ panel, reason: turnable ? 'grain-locked' : 'too-big' })
      continue
    }

    // Try existing open sheets, smallest first (fill offcuts before big ones).
    // `some` short-circuits on the first sheet that takes it.
    const openSmallestFirst = [...bins].sort((a, b) => area(a.length, a.width) - area(b.length, b.width))
    if (openSmallestFirst.some((bin) => placeInBin(bin, panel, kerf, margin, carve))) continue

    // Open a new sheet: the smallest available stock that fits this part.
    const slot = inventory.find((s) => s.remaining > 0 && fitsUsable(panel, s.uL, s.uW))
    if (!slot) {
      unplaced.push({ panel, reason: 'no-space' }) // fits a stock size, but the quantity ran out
      continue
    }

    slot.remaining -= 1
    const bin: Bin = {
      length: slot.stock.length,
      width: slot.stock.width,
      // Bin gets one extra kerf so a part reserved as (size + kerf) still sits
      // flush to the far margin.
      free: [{ x: 0, y: 0, w: slot.uL + kerf, h: slot.uW + kerf }],
      placements: [],
      usedArea: 0,
    }
    placeInBin(bin, panel, kerf, margin, carve)
    bins.push(bin)
  }

  return { bins, unplaced, remaining: new Map(inventory.map((s) => [s.stock.id, s.remaining])) }
}
