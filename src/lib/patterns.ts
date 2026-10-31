import type { Finish } from './finishes'

/**
 * The surface patterns of finishes — wood grain, marble veins, brushed metal —
 * drawn in code rather than shipped as photos: nothing to download or
 * license, and any colour works, since each is a grey tile the material's
 * colour then tints (white leaves the colour as is, darker shades it).
 *
 * Every tile repeats seamlessly: all the noise wraps at the tile's edge.
 * Patterns run along x; the viewport lines x up with the part's grain.
 */

/** Tiles are this many pixels square. */
export const TILE_PX = 512

/** A grey tile, one byte per pixel, row by row. */
export interface Tile {
  size: number
  grey: Uint8Array
  /** How much surface (metres) one tile covers, so patterns keep a real-world
   *  scale whatever the part's size. */
  metres: number
}

// ---- Noise that wraps ------------------------------------------------------

/** A repeatable pseudo-random number in [0, 1) for a lattice point. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const smooth = (t: number) => t * t * (3 - 2 * t)
const mod = (n: number, m: number) => ((n % m) + m) % m

/** Value noise in [0, 1), repeating every `px` × `py` lattice cells. */
function noise(x: number, y: number, px: number, py: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = smooth(x - x0)
  const fy = smooth(y - y0)
  const ax = mod(x0, px)
  const bx = mod(x0 + 1, px)
  const ay = mod(y0, py)
  const by = mod(y0 + 1, py)
  const top = hash(ax, ay, seed) * (1 - fx) + hash(bx, ay, seed) * fx
  const bottom = hash(ax, by, seed) * (1 - fx) + hash(bx, by, seed) * fx
  return top * (1 - fy) + bottom * fy
}

/** Layered noise in about [0, 1), repeating once per tile. `u`, `v` are tile
 *  coordinates in [0, 1); `fx`, `fy` the coarsest layer's cells per tile
 *  (whole numbers, so it wraps). */
function fbm(u: number, v: number, fx: number, fy: number, octaves: number, seed: number): number {
  let sum = 0
  let amp = 0.5
  let total = 0
  for (let o = 0; o < octaves; o++) {
    const k = 2 ** o
    sum += amp * noise(u * fx * k, v * fy * k, fx * k, fy * k, seed + o * 97)
    total += amp
    amp /= 2
  }
  return sum / total
}

// ---- Patterns --------------------------------------------------------------

interface WoodGrain {
  /** Growth rings across the tile. */
  rings: number
  /** How dark the late-wood lines are. */
  contrast: number
  /** How narrow they are (higher: thinner lines). */
  sharpness: number
  /** How much the rings wander. */
  warp: number
  /** Open pores, as in oak: short dark flecks along the grain. */
  pores: number
}

const WOOD: Record<string, WoodGrain> = {
  maple: { rings: 10, contrast: 0.1, sharpness: 6, warp: 1.2, pores: 0 },
  birch: { rings: 8, contrast: 0.09, sharpness: 5, warp: 1.6, pores: 0 },
  oak: { rings: 7, contrast: 0.22, sharpness: 3, warp: 2, pores: 0.16 },
  cherry: { rings: 9, contrast: 0.14, sharpness: 4, warp: 1.5, pores: 0 },
  walnut: { rings: 6, contrast: 0.26, sharpness: 3, warp: 2.4, pores: 0.08 },
  pine: { rings: 5, contrast: 0.34, sharpness: 2, warp: 1.6, pores: 0 },
}

/** Flat-sawn boards: rings as long bands along x, wandering a little, with
 *  fine fibre streaks and, for some species, open pores. */
function wood(g: WoodGrain): (u: number, v: number) => number {
  return (u, v) => {
    const t = v * g.rings + (fbm(u, v, 2, 6, 4, 11) - 0.5) * g.warp
    const late = Math.abs(Math.sin(Math.PI * t)) ** g.sharpness
    const fibre = fbm(u, v, 4, 96, 3, 23) - 0.5
    const pore = g.pores && noise(u * 48, v * 384, 48, 384, 31) > 0.86 ? g.pores : 0
    return 0.97 - g.contrast * late + fibre * 0.08 - pore
  }
}

const PATTERNS: Record<string, { metres: number; at: (u: number, v: number) => number }> = {
  ...Object.fromEntries(Object.entries(WOOD).map(([id, g]) => [`wood:${id}`, { metres: 0.8, at: wood(g) }])),
  // Soft grey veins drifting diagonally through a pale field, with finer
  // threads branching between them.
  'stone:marble': {
    metres: 1.2,
    at: (u, v) => {
      const swirl = fbm(u, v, 3, 3, 5, 41)
      const main = 1 - Math.abs(Math.sin(Math.PI * 2 * (u + v) + swirl * 6))
      const thread = 1 - Math.abs(Math.sin(Math.PI * 4 * (u - v) + fbm(u, v, 4, 4, 5, 45) * 9))
      return 0.97 - 0.2 * main ** 6 - 0.3 * main ** 40 - 0.18 * thread ** 30 - 0.04 * fbm(u, v, 6, 6, 3, 43)
    },
  },
  // Salt-and-pepper speckle of different minerals.
  'stone:granite': {
    metres: 0.4,
    at: (u, v) => {
      const grain = noise(u * 160, v * 160, 160, 160, 51)
      const fleck = grain > 0.8 ? -0.35 : grain < 0.12 ? 0.08 : 0
      return 0.86 + (fbm(u, v, 24, 24, 2, 53) - 0.5) * 0.25 + fleck
    },
  },
  // Soft cloudy variation with the odd small pit.
  'stone:concrete': {
    metres: 1,
    at: (u, v) => {
      const pit = noise(u * 128, v * 128, 128, 128, 61) > 0.93 ? 0.18 : 0
      return 0.9 + (fbm(u, v, 4, 4, 5, 63) - 0.5) * 0.16 - pit
    },
  },
  // Chips of stone set in a pale binder: one chip per cell of a grid, each
  // its own size, place and shade.
  'stone:terrazzo': {
    metres: 0.5,
    at: (u, v) => {
      const cells = 20
      const cx = Math.floor(u * cells)
      const cy = Math.floor(v * cells)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = mod(cx + dx, cells)
          const j = mod(cy + dy, cells)
          if (hash(i, j, 71) < 0.25) continue // not every cell has a chip
          const px = (cx + dx + hash(i, j, 72)) / cells
          const py = (cy + dy + hash(i, j, 73)) / cells
          const r = (0.18 + 0.35 * hash(i, j, 74)) / cells
          if (Math.hypot(u - px, v - py) < r) return 0.4 + 0.45 * hash(i, j, 75)
        }
      }
      return 0.95 - fbm(u, v, 8, 8, 2, 76) * 0.05
    },
  },
  // Fine parallel scratches along x.
  'metal:brushed': {
    metres: 0.6,
    at: (u, v) => 0.88 + (fbm(u, v, 2, 256, 3, 81) - 0.5) * 0.22,
  },
  // Mill scale: soft mottling with a little grit.
  'metal:raw': {
    metres: 0.6,
    at: (u, v) => 0.86 + (fbm(u, v, 6, 6, 4, 91) - 0.5) * 0.24 + (noise(u * 200, v * 200, 200, 200, 93) - 0.5) * 0.06,
  },
}

/** Whether a finish and variant have a pattern (paint doesn't). */
export const hasPattern = (finish: Finish | undefined, variant: string | undefined) =>
  `${finish}:${variant}` in PATTERNS

/** Draw a finish's tile, or null for one without a pattern. */
export function drawPattern(finish: Finish | undefined, variant: string | undefined, size = TILE_PX): Tile | null {
  const pattern = PATTERNS[`${finish}:${variant}`]
  if (!pattern) return null
  const grey = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = pattern.at(x / size, y / size)
      grey[y * size + x] = Math.round(255 * Math.min(1, Math.max(0, value)))
    }
  }
  return { size, grey, metres: pattern.metres }
}
