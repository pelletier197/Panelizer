/**
 * What a material looks like: its finish (paint, wood, stone, metal), the
 * pattern within it (a species of wood, a kind of stone), and how it catches
 * the light. The colour is kept on the material and tints the pattern, the
 * way a stain colours wood without hiding its grain.
 */

export type Finish = 'paint' | 'wood' | 'stone' | 'metal'

export interface Variant {
  id: string
  label: string
  /** Its colour untreated: the photo's average colour, so picking it shows
   *  the photo as it is (a stain then tints by how far it is from this). */
  natural: string
  /** The photo texture (`public/textures/<id>-color.webp`): how much surface
   *  (metres) one copy covers, and the strength of its relief map
   *  (`<id>-normal.webp`), absent for a surface flat enough not to need one. */
  photo: { metres: number; relief?: number }
}

export interface Swatch {
  name: string
  color: string
}

export interface FinishInfo {
  id: Finish
  label: string
  /** Patterns within the finish; paint has none. */
  variants: Variant[]
  /** Colours offered for it — the ones furniture is commonly finished in. */
  palette: Swatch[]
  /** How rough the surface reads under light (0 mirror … 1 chalk). */
  roughness: number
  metalness: number
}

export const FINISHES: FinishInfo[] = [
  {
    id: 'paint',
    label: 'Paint',
    variants: [],
    palette: [
      { name: 'Natural ply', color: '#d9b380' },
      { name: 'Pure white', color: '#f4f2ec' },
      { name: 'Alabaster', color: '#ece6d8' },
      { name: 'Greige', color: '#c9bfae' },
      { name: 'Light grey', color: '#b9bcbd' },
      { name: 'Sage', color: '#a3ad92' },
      { name: 'Olive', color: '#6f7350' },
      { name: 'Forest', color: '#3f5446' },
      { name: 'Powder blue', color: '#a7bccb' },
      { name: 'Navy', color: '#2f3d55' },
      { name: 'Terracotta', color: '#b56a4c' },
      { name: 'Mustard', color: '#c99a3e' },
      { name: 'Blush', color: '#d9b2a6' },
      { name: 'Charcoal', color: '#3d3f42' },
      { name: 'Black', color: '#1e1e20' },
    ],
    roughness: 0.6,
    metalness: 0,
  },
  {
    id: 'wood',
    label: 'Wood',
    variants: [
      { id: 'maple', label: 'Maple', natural: '#cd9d6f', photo: { metres: 0.8, relief: 0.5 } },
      { id: 'birch', label: 'Birch', natural: '#d5a37e', photo: { metres: 0.8, relief: 0.5 } },
      { id: 'oak', label: 'Oak', natural: '#7c644e', photo: { metres: 0.8, relief: 0.8 } },
      { id: 'cherry', label: 'Cherry', natural: '#693918', photo: { metres: 0.8, relief: 0.5 } },
      { id: 'walnut', label: 'Walnut', natural: '#42352f', photo: { metres: 0.8, relief: 0.6 } },
      { id: 'pine', label: 'Pine', natural: '#b07340', photo: { metres: 0.8 } },
    ],
    palette: [
      { name: 'Whitewash', color: '#e6ddcd' },
      { name: 'Grey wash', color: '#b5aea3' },
      { name: 'Honey', color: '#d4a25c' },
      { name: 'Golden oak', color: '#c08a4a' },
      { name: 'Cherry', color: '#a8603e' },
      { name: 'Red mahogany', color: '#7e3d2a' },
      { name: 'Walnut', color: '#6e4a31' },
      { name: 'Espresso', color: '#3f2a1e' },
      { name: 'Ebony', color: '#2a211c' },
    ],
    roughness: 0.55,
    metalness: 0,
  },
  {
    id: 'stone',
    label: 'Stone',
    variants: [
      { id: 'marble', label: 'Marble', natural: '#e4e8eb', photo: { metres: 1.2 } },
      { id: 'granite', label: 'Granite', natural: '#bab6b2', photo: { metres: 0.6 } },
      { id: 'concrete', label: 'Concrete', natural: '#b8b8b8', photo: { metres: 1.1, relief: 0.6 } },
      { id: 'terrazzo', label: 'Terrazzo', natural: '#dbd6d0', photo: { metres: 0.6 } },
    ],
    palette: [
      { name: 'Carrara white', color: '#efede9' },
      { name: 'Calacatta', color: '#f2ece0' },
      { name: 'Travertine', color: '#dccbae' },
      { name: 'Light grey', color: '#c4c3c0' },
      { name: 'Slate', color: '#6c6f72' },
      { name: 'Verde', color: '#4f6a5a' },
      { name: 'Nero', color: '#2a2a2c' },
    ],
    roughness: 0.3,
    metalness: 0,
  },
  {
    id: 'metal',
    label: 'Metal',
    variants: [
      { id: 'brushed', label: 'Brushed', natural: '#929598', photo: { metres: 0.5 } },
      { id: 'raw', label: 'Raw', natural: '#b6babb', photo: { metres: 0.8 } },
    ],
    palette: [
      { name: 'Stainless', color: '#c7c9cc' },
      { name: 'Aluminium', color: '#d4d6d8' },
      { name: 'Gunmetal', color: '#5a5d62' },
      { name: 'Black', color: '#2b2c2e' },
      { name: 'Brass', color: '#c9a35b' },
      { name: 'Copper', color: '#b8734f' },
      { name: 'Bronze', color: '#8c6a45' },
    ],
    roughness: 0.38,
    metalness: 0.85,
  },
]

export const finishInfo = (finish: Finish | undefined): FinishInfo =>
  FINISHES.find((f) => f.id === finish) ?? FINISHES[0]

/** The variant a material shows: its own if the finish has it, else the
 *  finish's first (paint has none). */
export function variantOf(finish: Finish | undefined, variant: string | undefined): Variant | undefined {
  const { variants } = finishInfo(finish)
  return variants.find((v) => v.id === variant) ?? variants[0]
}

const HEX = /^#[0-9a-f]{6}$/i

/** Whether a value is a colour as materials store it: `#rrggbb`. */
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value)

export const isFinish = (value: unknown): value is Finish => FINISHES.some((f) => f.id === value)
