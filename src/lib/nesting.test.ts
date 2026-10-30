import { describe, expect, it } from 'vitest'
import { generateCutlist } from './nesting'
import type { Panel, Grain } from '../types/panel'
import type { Material } from './materials'
import type { Stock } from './stock'

/**
 * Characterization tests for the MaxRects cutlist packer.
 *
 * These exist because the packer carries a lot of hard-won behaviour that no
 * off-the-shelf bin-packing library reproduces: grain-constrained rotation,
 * multi-stock inventories opened smallest-first (offcuts before full sheets),
 * respected stock quantities, and three distinct "unplaced" reasons. The
 * refactor only restructures `generateCutlist` into helpers, so every
 * assertion here must survive untouched.
 */

const MAT: Material = { id: 'ply', name: 'Plywood', color: '#d9b380' }
const MATERIALS = [MAT]

let seq = 0
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
  name: 'Part',
  normal: 'z',
  length: 400,
  width: 300,
  thickness: 18,
  position: [0, 0, 0],
  materialId: MAT.id,
  grain: 'none' as Grain,
  ...over,
})

const sheet = (over: Partial<Stock> = {}): Stock => ({
  id: `s${seq++}`,
  materialId: MAT.id,
  thickness: 18,
  length: 2440,
  width: 1220,
  quantity: null,
  ...over,
})

/** Every placement across every sheet of every group. */
const allPlacements = (r: ReturnType<typeof generateCutlist>) =>
  r.groups.flatMap((g) => g.sheets.flatMap((s) => s.placements))

describe('generateCutlist — basics', () => {
  it('places a part that fits and reports no unplaced', () => {
    const p = panel()
    const r = generateCutlist([p], MATERIALS, [sheet()], 3, 10)

    expect(r.unplaced).toEqual([])
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].sheets).toHaveLength(1)
    expect(r.groups[0].sheets[0].placements).toHaveLength(1)
    expect(r.groups[0].sheets[0].placements[0].panelId).toBe(p.id)
  })

  it('carries material identity onto the group', () => {
    const r = generateCutlist([panel()], MATERIALS, [sheet()], 3, 10)
    expect(r.groups[0].materialName).toBe('Plywood')
    expect(r.groups[0].color).toBe('#d9b380')
    expect(r.groups[0].thickness).toBe(18)
  })

  it('offsets placements by the margin', () => {
    const r = generateCutlist([panel()], MATERIALS, [sheet()], 3, 10)
    const pl = r.groups[0].sheets[0].placements[0]
    expect(pl.x).toBe(10)
    expect(pl.y).toBe(10)
  })

  it('accumulates usedArea from the true part area', () => {
    const r = generateCutlist([panel({ length: 400, width: 300 })], MATERIALS, [sheet()], 3, 10)
    expect(r.groups[0].sheets[0].usedArea).toBe(400 * 300)
  })

  it('numbers sheets 1-based within a group', () => {
    // Two parts that each need most of a small sheet -> two sheets.
    const parts = [panel({ length: 900, width: 500 }), panel({ length: 900, width: 500 })]
    const r = generateCutlist(parts, MATERIALS, [sheet({ length: 1000, width: 600 })], 3, 10)
    expect(r.groups[0].sheets.map((s) => s.index)).toEqual([1, 2])
  })

  it('returns nothing for no panels', () => {
    const r = generateCutlist([], MATERIALS, [sheet()], 3, 10)
    expect(r.groups).toEqual([])
    expect(r.unplaced).toEqual([])
  })
})

describe('generateCutlist — grouping', () => {
  it('splits groups by thickness', () => {
    const r = generateCutlist(
      [panel({ thickness: 18 }), panel({ thickness: 12 })],
      MATERIALS,
      [sheet({ thickness: 18 }), sheet({ thickness: 12 })],
      3,
      10,
    )
    expect(r.groups).toHaveLength(2)
    expect(r.groups.map((g) => g.thickness).sort()).toEqual([12, 18])
  })

  it('splits groups by material', () => {
    const mdf: Material = { id: 'mdf', name: 'MDF', color: '#9aa0ab' }
    const r = generateCutlist(
      [panel(), panel({ materialId: 'mdf' })],
      [MAT, mdf],
      [sheet(), sheet({ materialId: 'mdf' })],
      3,
      10,
    )
    expect(r.groups).toHaveLength(2)
    expect(r.groups.map((g) => g.materialName).sort()).toEqual(['MDF', 'Plywood'])
  })

  it('matches stock thickness within tolerance so 11/16" nests with 18mm', () => {
    // 11/16" = 17.4625mm, ~0.54mm from 18 — inside the 0.8mm tolerance.
    const r = generateCutlist([panel({ thickness: 18 })], MATERIALS, [sheet({ thickness: 17.4625 })], 3, 10)
    expect(r.unplaced).toEqual([])
    expect(allPlacements(r)).toHaveLength(1)
  })

  it('does NOT merge distinct real thicknesses (3/4" vs 18mm)', () => {
    // 3/4" = 19.05mm, ~1.05mm from 18 — outside the tolerance.
    const r = generateCutlist([panel({ thickness: 18 })], MATERIALS, [sheet({ thickness: 19.05 })], 3, 10)
    expect(r.unplaced).toHaveLength(1)
    expect(r.unplaced[0].reason).toBe('no-stock')
  })
})

describe('generateCutlist — grain constraints', () => {
  it('lets a grain-free part rotate to fit', () => {
    // 900x500 into a 600x1000 usable area only fits rotated.
    const r = generateCutlist(
      [panel({ length: 900, width: 500, grain: 'none' })],
      MATERIALS,
      [sheet({ length: 620, width: 1020 })],
      0,
      10,
    )
    expect(r.unplaced).toEqual([])
    expect(allPlacements(r)[0].rotated).toBe(true)
  })

  it('refuses to rotate a length-grained part, and says the grain is why', () => {
    const r = generateCutlist(
      [panel({ length: 900, width: 500, grain: 'length' })],
      MATERIALS,
      [sheet({ length: 620, width: 1020 })],
      0,
      10,
    )
    expect(r.unplaced).toHaveLength(1)
    expect(r.unplaced[0].reason).toBe('grain-locked')
  })

  it('still calls a part too big when turning would not help either', () => {
    const r = generateCutlist(
      [panel({ length: 1500, width: 1500, grain: 'length' })],
      MATERIALS,
      [sheet({ length: 620, width: 1020 })],
      0,
      10,
    )
    expect(r.unplaced[0].reason).toBe('too-big')
  })

  it('places a width-grained part always rotated', () => {
    const r = generateCutlist(
      [panel({ length: 500, width: 900, grain: 'width' })],
      MATERIALS,
      [sheet()],
      0,
      10,
    )
    const pl = allPlacements(r)[0]
    expect(pl.rotated).toBe(true)
    expect(pl.w).toBe(900)
    expect(pl.h).toBe(500)
  })

  it('places a length-grained part unrotated with length along X', () => {
    const r = generateCutlist(
      [panel({ length: 900, width: 500, grain: 'length' })],
      MATERIALS,
      [sheet()],
      0,
      10,
    )
    const pl = allPlacements(r)[0]
    expect(pl.rotated).toBe(false)
    expect(pl.w).toBe(900)
    expect(pl.h).toBe(500)
  })
})

describe('generateCutlist — unplaced reasons', () => {
  it('reports no-stock when nothing matches the material+thickness', () => {
    const r = generateCutlist([panel()], MATERIALS, [], 3, 10)
    expect(r.groups).toEqual([])
    expect(r.unplaced).toHaveLength(1)
    expect(r.unplaced[0]).toMatchObject({
      reason: 'no-stock',
      materialId: MAT.id,
      materialName: 'Plywood',
      thickness: 18,
    })
  })

  it('reports too-big when larger than every matching sheet', () => {
    const r = generateCutlist([panel({ length: 5000, width: 100 })], MATERIALS, [sheet()], 3, 10)
    expect(r.unplaced).toHaveLength(1)
    expect(r.unplaced[0].reason).toBe('too-big')
  })

  it('reports no-space when it would fit but the quantity ran out', () => {
    // Each part needs its own sheet; only one sheet exists.
    const parts = [panel({ length: 900, width: 500 }), panel({ length: 900, width: 500 })]
    const r = generateCutlist(parts, MATERIALS, [sheet({ length: 1000, width: 600, quantity: 1 })], 3, 10)
    expect(r.groups[0].sheets).toHaveLength(1)
    expect(r.unplaced).toHaveLength(1)
    expect(r.unplaced[0].reason).toBe('no-space')
  })

  it('never invents sheets beyond the available quantity', () => {
    const parts = Array.from({ length: 6 }, () => panel({ length: 900, width: 500 }))
    const r = generateCutlist(parts, MATERIALS, [sheet({ length: 1000, width: 600, quantity: 2 })], 3, 10)
    expect(r.groups[0].sheets).toHaveLength(2)
    expect(r.unplaced).toHaveLength(4)
    expect(r.unplaced.every((u) => u.reason === 'no-space')).toBe(true)
  })

  it('opens as many sheets as needed when quantity is unlimited (null)', () => {
    const parts = Array.from({ length: 4 }, () => panel({ length: 900, width: 500 }))
    const r = generateCutlist(parts, MATERIALS, [sheet({ length: 1000, width: 600, quantity: null })], 3, 10)
    expect(r.groups[0].sheets).toHaveLength(4)
    expect(r.unplaced).toEqual([])
  })
})

describe('generateCutlist — multi-stock inventory', () => {
  it('opens the smallest stock that fits, using offcuts before full sheets', () => {
    const offcut = sheet({ length: 600, width: 400 })
    const full = sheet({ length: 2440, width: 1220 })
    // Small part fits the offcut; inventory is sorted smallest-first.
    const r = generateCutlist([panel({ length: 300, width: 200 })], MATERIALS, [full, offcut], 3, 10)
    expect(r.groups[0].sheets).toHaveLength(1)
    expect(r.groups[0].sheets[0].length).toBe(600)
    expect(r.groups[0].sheets[0].width).toBe(400)
  })

  it('falls through to a bigger sheet when the part does not fit the offcut', () => {
    const offcut = sheet({ length: 600, width: 400 })
    const full = sheet({ length: 2440, width: 1220 })
    const r = generateCutlist([panel({ length: 2000, width: 800 })], MATERIALS, [full, offcut], 3, 10)
    expect(r.groups[0].sheets).toHaveLength(1)
    expect(r.groups[0].sheets[0].length).toBe(2440)
  })

  it('fills an already-open sheet before opening another', () => {
    const parts = [panel({ length: 300, width: 200 }), panel({ length: 300, width: 200 })]
    const r = generateCutlist(parts, MATERIALS, [sheet()], 3, 10)
    expect(r.groups[0].sheets).toHaveLength(1)
    expect(r.groups[0].sheets[0].placements).toHaveLength(2)
  })
})

describe('generateCutlist — kerf and margin', () => {
  it('keeps a kerf gap between adjacent parts', () => {
    // Two parts exactly half the usable width apart need the kerf to not fit.
    const usable = 1000
    const s = sheet({ length: usable + 20, width: 400, quantity: 1 })
    const half = usable / 2
    const parts = [panel({ length: half, width: 100 }), panel({ length: half, width: 100 })]
    const withKerf = generateCutlist(parts, MATERIALS, [s], 10, 10)
    // With a 10mm kerf the two halves can't sit side by side on one row, but
    // the sheet is tall enough to stack them — both still place.
    expect(withKerf.unplaced).toEqual([])
    const placed = allPlacements(withKerf)
    expect(placed).toHaveLength(2)
    // They must not overlap once the kerf is honoured.
    const [a, b] = placed
    const overlaps =
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
    expect(overlaps).toBe(false)
  })

  it('lets a part exactly filling the usable area sit flush (kerf not double-counted)', () => {
    // Usable = 2440-20 x 1220-20. A part that exact size must still fit with kerf.
    const r = generateCutlist(
      [panel({ length: 2420, width: 1200, grain: 'length' })],
      MATERIALS,
      [sheet()],
      3,
      10,
    )
    expect(r.unplaced).toEqual([])
    expect(allPlacements(r)).toHaveLength(1)
  })

  it('shrinks the usable area as the margin grows', () => {
    const big = panel({ length: 2420, width: 1200, grain: 'length' })
    expect(generateCutlist([big], MATERIALS, [sheet()], 3, 10).unplaced).toEqual([])
    // A 100mm margin leaves only 2240x1020 — the same part no longer fits.
    const tight = generateCutlist([big], MATERIALS, [sheet()], 3, 100)
    expect(tight.unplaced).toHaveLength(1)
    expect(tight.unplaced[0].reason).toBe('too-big')
  })
})

describe('generateCutlist — packing quality', () => {
  it('never overlaps two placements on the same sheet', () => {
    const parts = Array.from({ length: 12 }, (_, i) =>
      panel({ length: 300 + i * 20, width: 200 + i * 10 }),
    )
    const r = generateCutlist(parts, MATERIALS, [sheet()], 3, 10)
    for (const sh of r.groups[0].sheets) {
      for (let i = 0; i < sh.placements.length; i++) {
        for (let j = i + 1; j < sh.placements.length; j++) {
          const a = sh.placements[i]
          const b = sh.placements[j]
          const overlaps =
            a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
          expect(overlaps).toBe(false)
        }
      }
    }
  })

  it('keeps every placement inside the sheet', () => {
    const parts = Array.from({ length: 8 }, () => panel({ length: 600, width: 400 }))
    const r = generateCutlist(parts, MATERIALS, [sheet()], 3, 10)
    for (const sh of r.groups[0].sheets) {
      for (const pl of sh.placements) {
        expect(pl.x).toBeGreaterThanOrEqual(10)
        expect(pl.y).toBeGreaterThanOrEqual(10)
        expect(pl.x + pl.w).toBeLessThanOrEqual(sh.length - 10)
        expect(pl.y + pl.h).toBeLessThanOrEqual(sh.width - 10)
      }
    }
  })

  it('places every part exactly once when they all fit', () => {
    const parts = Array.from({ length: 10 }, () => panel({ length: 400, width: 300 }))
    const r = generateCutlist(parts, MATERIALS, [sheet()], 3, 10)
    const ids = allPlacements(r).map((p) => p.panelId).sort()
    expect(ids).toEqual(parts.map((p) => p.id).sort())
  })
})

describe('generateCutlist — shared stock across thickness groups', () => {
  it('counts a sheet once even when two thicknesses can both use it', () => {
    // 18 mm and 11/16" (17.4625) both match the one sheet in stock.
    const parts = [panel({ length: 900, width: 500 }), panel({ length: 900, width: 500, thickness: 17.4625 })]
    const r = generateCutlist(parts, MATERIALS, [sheet({ length: 1000, width: 600, quantity: 1 })], 3, 10)
    const sheets = r.groups.reduce((sum, g) => sum + g.sheets.length, 0)
    expect(sheets).toBe(1)
    expect(r.unplaced.map((u) => u.reason)).toEqual(['no-space'])
  })

  it('lets near-identical thicknesses share a sheet', () => {
    // A thickness stored as 18.0000001 (unit-conversion noise) is still 18 mm.
    const parts = [panel({ length: 400, width: 300 }), panel({ length: 400, width: 300, thickness: 18.0000001 })]
    const r = generateCutlist(parts, MATERIALS, [sheet()], 3, 10)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].sheets).toHaveLength(1)
    expect(r.groups[0].sheets[0].placements).toHaveLength(2)
  })

  it('leaves out a group whose every part is unplaced', () => {
    const r = generateCutlist([panel({ length: 5000, width: 100 })], MATERIALS, [sheet()], 3, 10)
    expect(r.groups).toEqual([])
    expect(r.unplaced[0].reason).toBe('too-big')
  })
})

/** Whether a set of rectangles can be separated by straight, edge-to-edge
 *  cuts, recursively — i.e. cut on a table saw. */
function isGuillotine(rects: { x: number; y: number; w: number; h: number }[]): boolean {
  if (rects.length <= 1) return true
  for (const axis of ['x', 'y'] as const) {
    const size = axis === 'x' ? 'w' : 'h'
    for (const r of rects) {
      const cut = r[axis] + r[size]
      const before = rects.filter((o) => o[axis] + o[size] <= cut)
      const after = rects.filter((o) => o[axis] >= cut)
      if (before.length > 0 && after.length > 0 && before.length + after.length === rects.length) {
        return isGuillotine(before) && isGuillotine(after)
      }
    }
  }
  return false
}

/** Small deterministic PRNG so the generated part sets are the same every run. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('generateCutlist — saw-friendly layouts', () => {
  const randomParts = (seed: number, count: number) => {
    const rand = rng(seed)
    return Array.from({ length: count }, () =>
      panel({ length: 100 + Math.round(rand() * 800), width: 80 + Math.round(rand() * 500), grain: rand() < 0.5 ? 'none' : 'length' }),
    )
  }

  it('is the default style', () => {
    const parts = randomParts(7, 20)
    const stock = [sheet()]
    const implicit = generateCutlist(parts, MATERIALS, stock, 3, 10)
    const explicit = generateCutlist(parts, MATERIALS, stock, 3, 10, { style: 'guillotine' })
    expect(implicit).toEqual(explicit)
  })

  it('(the cut check itself rejects a pinwheel, which no saw can cut)', () => {
    // Four 2×1 parts wound around a 1×1 hole: every straight line crosses one.
    const pinwheel = [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 2, y: 0, w: 1, h: 2 },
      { x: 1, y: 2, w: 2, h: 1 },
      { x: 0, y: 1, w: 1, h: 2 },
    ]
    expect(isGuillotine(pinwheel)).toBe(false)
    expect(isGuillotine([{ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 }])).toBe(true)
  })

  it('only produces sheets that straight edge-to-edge cuts can separate', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = generateCutlist(randomParts(seed, 25), MATERIALS, [sheet()], 3, 10)
      for (const s of r.groups[0].sheets) expect(isGuillotine(s.placements)).toBe(true)
    }
  })

  it('still places every part, never overlapping, inside the margins', () => {
    const parts = randomParts(99, 30)
    const r = generateCutlist(parts, MATERIALS, [sheet()], 3, 10)
    expect(allPlacements(r).map((p) => p.panelId).sort()).toEqual(parts.map((p) => p.id).sort())
    for (const s of r.groups[0].sheets) {
      for (const [i, a] of s.placements.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(10)
        expect(a.x + a.w).toBeLessThanOrEqual(s.length - 10)
        for (const b of s.placements.slice(i + 1)) {
          expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false)
        }
      }
    }
  })

  it('the free style is still available and never needs more sheets', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const parts = randomParts(seed, 25)
      const saw = generateCutlist(parts, MATERIALS, [sheet()], 3, 10, { style: 'guillotine' })
      const free = generateCutlist(parts, MATERIALS, [sheet()], 3, 10, { style: 'free' })
      expect(free.groups[0].sheets.length).toBeLessThanOrEqual(saw.groups[0].sheets.length)
    }
  })
})

describe('generateCutlist — rounded corners', () => {
  it('carries the radii onto the sheet, turned with the part', () => {
    const straight = generateCutlist(
      [panel({ length: 900, width: 500, grain: 'length', corners: [10, 20, 30, 40] })],
      MATERIALS,
      [sheet()],
      0,
      10,
    )
    expect(allPlacements(straight)[0].corners).toEqual([10, 20, 30, 40])

    const turned = generateCutlist(
      [panel({ length: 500, width: 900, grain: 'width', corners: [10, 20, 30, 40] })],
      MATERIALS,
      [sheet()],
      0,
      10,
    )
    expect(allPlacements(turned)[0].rotated).toBe(true)
    expect(allPlacements(turned)[0].corners).toEqual([20, 30, 40, 10])
  })

  it('packs a rounded part by its rectangle, and leaves square parts plain', () => {
    const r = generateCutlist([panel({ corners: [50, 50, 50, 50] }), panel()], MATERIALS, [sheet()], 3, 10)
    expect(r.unplaced).toEqual([])
    expect(allPlacements(r).filter((p) => p.corners)).toHaveLength(1)
  })
})
