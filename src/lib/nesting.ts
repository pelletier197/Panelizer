import type { Panel } from '../types/panel'
import type { Material } from './materials'
import type { Stock } from './stock'
import { findMaterial } from './materials'

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
   *  `no-space`: would fit, but the available sheet quantity ran out. */
  reason: 'no-stock' | 'too-big' | 'no-space'
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

interface Shelf {
  y: number // top of the shelf within the usable area
  height: number
  cursorX: number // next free x within the usable area
}

interface Sheet {
  length: number
  width: number
  uL: number // usable length (sheet length minus both margins)
  uW: number // usable width
  shelves: Shelf[]
  usedHeight: number // total shelf heights + kerf gaps
  placements: Placement[]
  usedArea: number
}

/** Whether a part fits an empty usable area in at least one allowed orientation. */
function fitsUsable(panel: Panel, uL: number, uW: number): boolean {
  return footprints(panel).some((f) => f.w <= uL && f.h <= uW)
}

/** Try to place one part on a sheet using a shelf/strip packer. Returns true if
 *  it fit. Uses the sheet's own usable dimensions. */
function placeOnSheet(sheet: Sheet, panel: Panel, kerf: number, margin: number): boolean {
  for (const f of footprints(panel)) {
    if (f.w > sheet.uL || f.h > sheet.uW) continue // can't fit this orientation at all

    // 1) An existing shelf tall enough with room to its right.
    for (const shelf of sheet.shelves) {
      const gap = shelf.cursorX === 0 ? 0 : kerf
      if (f.h <= shelf.height && shelf.cursorX + gap + f.w <= sheet.uL) {
        const x = margin + shelf.cursorX + gap
        sheet.placements.push({ panelId: panel.id, name: panel.name, x, y: margin + shelf.y, w: f.w, h: f.h, rotated: f.rotated })
        shelf.cursorX += gap + f.w
        sheet.usedArea += panel.length * panel.width
        return true
      }
    }

    // 2) A new shelf below the existing ones.
    const gap = sheet.shelves.length === 0 ? 0 : kerf
    const y = sheet.usedHeight + gap
    if (y + f.h <= sheet.uW) {
      sheet.shelves.push({ y, height: f.h, cursorX: f.w })
      sheet.usedHeight = y + f.h
      sheet.placements.push({ panelId: panel.id, name: panel.name, x: margin, y: margin + y, w: f.w, h: f.h, rotated: f.rotated })
      sheet.usedArea += panel.length * panel.width
      return true
    }
  }
  return false
}

/** Stock inventory entry: one stock size and how many sheets remain to open. */
interface Slot {
  stock: Stock
  uL: number
  uW: number
  remaining: number // Infinity when the stock quantity is unlimited (null)
}

const area = (l: number, w: number) => l * w

/** Stock matches a group's thickness within this tolerance (mm). Exact float
 *  equality is too brittle across unit rounding: an "11/16" sheet (17.4625) and
 *  an 18 mm panel look identical to the user and should nest together, so the
 *  tolerance spans that ~0.54 mm gap — but stays under the ~1.05 mm gap to the
 *  next real thickness (3/4" = 19.05 mm) so distinct stock isn't merged. */
const THICKNESS_TOL = 0.8

/**
 * Nest the design's panels onto the available stock. Panels are grouped by
 * material + thickness and packed onto stock of the same material + thickness,
 * honouring kerf (gap between parts) and margin (clear border).
 *
 * All matching stock sizes are used, not just the first: parts fill already-open
 * sheets when they can, and when a new sheet is needed the **smallest** stock
 * that fits is opened (using up offcuts first and trimming waste). Stock
 * quantities are respected — the packer never invents sheets beyond what's
 * available; parts that then can't be placed are reported as unplaced:
 *  - `no-stock`  — no matching sheet exists,
 *  - `too-big`   — larger than every matching sheet,
 *  - `no-space`  — would fit, but the sheet quantity ran out.
 *
 * The per-sheet packer is a shelf/strip heuristic (first-fit-decreasing by
 * longest edge) — a tighter algorithm can drop in behind this same signature.
 */
export function generateCutlist(
  panels: Panel[],
  materials: Material[],
  stocks: Stock[],
  kerf: number,
  margin: number,
): CutlistResult {
  const groups: StockGroup[] = []
  const unplaced: UnplacedPart[] = []

  // Group panels by material + thickness (the identity of a stock).
  const byKey = new Map<string, Panel[]>()
  for (const panel of panels) {
    const key = `${panel.materialId}@${panel.thickness}`
    const list = byKey.get(key)
    if (list) list.push(panel)
    else byKey.set(key, [panel])
  }

  for (const [key, groupPanels] of byKey) {
    const [materialId, thicknessStr] = key.split('@')
    const thickness = Number(thicknessStr)
    const material = findMaterial(materials, materialId)
    const matching = stocks.filter(
      (s) => s.materialId === materialId && Math.abs(s.thickness - thickness) < THICKNESS_TOL,
    )

    const unfit = (panel: Panel, reason: UnplacedPart['reason']) =>
      unplaced.push({ panelId: panel.id, name: panel.name, reason, materialId, materialName: material.name, thickness })

    if (matching.length === 0) {
      for (const p of groupPanels) unfit(p, 'no-stock')
      continue
    }

    // Inventory, smallest sheet first — so offcuts / small sheets are opened
    // before full sheets, and a new sheet is always the smallest that fits.
    const inventory: Slot[] = matching
      .map((stock) => ({
        stock,
        uL: stock.length - 2 * margin,
        uW: stock.width - 2 * margin,
        remaining: stock.quantity == null ? Infinity : stock.quantity,
      }))
      .sort((a, b) => area(a.stock.length, a.stock.width) - area(b.stock.length, b.stock.width))

    const fitsAnyStock = (panel: Panel) => inventory.some((s) => fitsUsable(panel, s.uL, s.uW))

    // First-fit-decreasing: tackle the biggest parts first.
    const sorted = [...groupPanels].sort(
      (a, b) => Math.max(b.length, b.width) - Math.max(a.length, a.width),
    )

    const sheets: Sheet[] = []
    for (const panel of sorted) {
      if (!fitsAnyStock(panel)) {
        unfit(panel, 'too-big')
        continue
      }

      // Try existing open sheets, smallest first (fill offcuts before big ones).
      const openSmallestFirst = [...sheets].sort((a, b) => area(a.length, a.width) - area(b.length, b.width))
      let placed = false
      for (const sheet of openSmallestFirst) {
        if (placeOnSheet(sheet, panel, kerf, margin)) {
          placed = true
          break
        }
      }
      if (placed) continue

      // Open a new sheet: the smallest available stock that fits this part.
      const slot = inventory.find((s) => s.remaining > 0 && fitsUsable(panel, s.uL, s.uW))
      if (!slot) {
        unfit(panel, 'no-space') // fits a stock size, but the quantity ran out
        continue
      }
      slot.remaining -= 1
      const sheet: Sheet = {
        length: slot.stock.length,
        width: slot.stock.width,
        uL: slot.uL,
        uW: slot.uW,
        shelves: [],
        usedHeight: 0,
        placements: [],
        usedArea: 0,
      }
      placeOnSheet(sheet, panel, kerf, margin)
      sheets.push(sheet)
    }

    groups.push({
      key,
      materialName: material.name,
      color: material.color,
      thickness,
      sheets: sheets.map((s, i) => ({
        index: i + 1,
        length: s.length,
        width: s.width,
        placements: s.placements,
        usedArea: s.usedArea,
      })),
    })
  }

  return { groups, unplaced }
}
