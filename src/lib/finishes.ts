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
   *  (metres) one copy covers; the strength of its relief map
   *  (`<id>-normal.webp`), absent for a surface flat enough not to need one;
   *  its gloss map's average roughness (`<id>-gloss.webp`, presentation
   *  only), absent when it has none; and `turned` for a photo whose grain
   *  runs up and down rather than across, turned a quarter to lie along the
   *  part like the rest (only for one without relief, whose directions would
   *  turn wrong). */
  photo: { metres: number; relief?: number; gloss?: number; turned?: boolean }
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
    // The colours furniture painters keep coming back to, family by family —
    // close to the best-selling shade in each (from paint makers' published
    // colour values), named plainly rather than by brand.
    palette: [
      { name: 'Natural ply', color: '#d9b380' },
      { name: 'Warm white', color: '#efede4' },
      { name: 'Alabaster', color: '#ede9df' },
      { name: 'Greige', color: '#d1cbc1' },
      { name: 'Mushroom', color: '#ada496' },
      { name: 'Soft grey', color: '#c2bfb8' },
      { name: 'Sage', color: '#b2b699' },
      { name: 'Grey green', color: '#95978a' },
      { name: 'Forest green', color: '#3b4a3f' },
      { name: 'Misty blue', color: '#bfc9d0' },
      { name: 'Navy', color: '#2f3d4c' },
      { name: 'Slate blue', color: '#434c56' },
      { name: 'Clay', color: '#ac6b53' },
      { name: 'Bronze', color: '#54504a' },
      { name: 'Charcoal', color: '#434341' },
      { name: 'Soft black', color: '#2f2f30' },
    ],
    roughness: 0.6,
    metalness: 0,
  },
  {
    id: 'wood',
    label: 'Wood',
    variants: [
      { id: 'maple', label: 'Maple', natural: '#cd9d6f', photo: { metres: 0.8, relief: 0.5, gloss: 0.567 } },
      { id: 'birch', label: 'Birch', natural: '#d5a37e', photo: { metres: 0.8, relief: 0.5, gloss: 0.549 } },
      { id: 'oak', label: 'Oak', natural: '#7c644e', photo: { metres: 0.8, relief: 0.8, gloss: 0.504 } },
      { id: 'cherry', label: 'Cherry', natural: '#693918', photo: { metres: 0.8, relief: 0.5, gloss: 0.481 } },
      { id: 'walnut', label: 'Walnut', natural: '#42352f', photo: { metres: 0.8, relief: 0.6, gloss: 0.543 } },
      { id: 'pine', label: 'Pine', natural: '#b07340', photo: { metres: 0.8, gloss: 0.482, turned: true } },
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
      { id: 'marble', label: 'Marble', natural: '#e4e8eb', photo: { metres: 1.2, gloss: 0.232 } },
      { id: 'granite', label: 'Granite', natural: '#bab6b2', photo: { metres: 0.6 } },
      { id: 'concrete', label: 'Concrete', natural: '#b8b8b8', photo: { metres: 1.1, relief: 0.6, gloss: 0.516 } },
      { id: 'terrazzo', label: 'Terrazzo', natural: '#dbd6d0', photo: { metres: 0.6, gloss: 0.223 } },
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
      { id: 'brushed', label: 'Brushed', natural: '#929598', photo: { metres: 0.5, gloss: 0.469 } },
      { id: 'raw', label: 'Raw', natural: '#b6babb', photo: { metres: 0.8, gloss: 0.193 } },
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
