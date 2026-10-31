import { useSyncExternalStore } from 'react'
import { Color, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from 'three'
import type { Variant } from '../../lib/finishes'

/**
 * The finish photos (see `public/textures/`), loaded the first time a
 * material uses one — so a design that is all paint never downloads any.
 * Until a photo arrives, callers get null and fall back to the drawn pattern;
 * components re-render when it does (`usePhotos`).
 *
 * Two sets per variant: the everyday one for editing and swatches, and a
 * sharper one with gloss for the presentation view, fetched only when that
 * opens (callers show the everyday set until it arrives).
 */

/** Which set: `view` for editing, `present` for the presentation view. */
export type Tier = 'view' | 'present'

/** File suffixes of each set's maps; null where the set has none. */
const FILES: Record<Tier, { color: string; normal: string; gloss: string | null }> = {
  view: { color: 'color', normal: 'normal', gloss: null },
  present: { color: 'color-2k', normal: 'normal-2k', gloss: 'gloss' },
}

export interface Photo {
  image: HTMLImageElement
  /** Colour texture, one repeat per `metres` of surface (texture coordinates
   *  are in metres, see `applyPanelUVs`). */
  color: Texture
  /** Relief (normal map), when the variant has one. */
  normal: Texture | null
  /** How glossy each spot is (roughness map), in the presentation set. */
  gloss: Texture | null
}

const photos = new Map<string, Photo | 'loading' | 'failed'>()
const listeners = new Set<() => void>()
let version = 0

const url = (id: string, suffix: string) => `${import.meta.env.BASE_URL}textures/${id}-${suffix}.webp`

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = 'async'
  image.src = src
  return image.decode().then(() => image)
}

function texture(image: HTMLImageElement, metres: number, colour: boolean, turned = false): Texture {
  const t = new Texture(image)
  // A photo shot with its grain up and down, turned to run along the part.
  if (turned) t.rotation = Math.PI / 2
  t.colorSpace = colour ? SRGBColorSpace : NoColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(1 / metres, 1 / metres)
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/** A variant's photo set if it has arrived; otherwise null, and it starts
 *  loading. */
export function photoOf(variant: Variant, tier: Tier = 'view'): Photo | null {
  const key = `${variant.id}:${tier}`
  const entry = photos.get(key)
  if (entry && entry !== 'loading' && entry !== 'failed') return entry
  if (!entry) {
    photos.set(key, 'loading')
    const { metres, relief, gloss, turned } = variant.photo
    const files = FILES[tier]
    Promise.all([
      loadImage(url(variant.id, files.color)),
      relief ? loadImage(url(variant.id, files.normal)) : null,
      gloss && files.gloss ? loadImage(url(variant.id, files.gloss)) : null,
    ])
      .then(([image, normal, roughness]) => {
        photos.set(key, {
          image,
          color: texture(image, metres, true, turned),
          normal: normal && texture(normal, metres, false, turned),
          gloss: roughness && texture(roughness, metres, false, turned),
        })
      })
      // Offline or missing: keep what's shown meanwhile.
      .catch(() => photos.set(key, 'failed'))
      .finally(() => {
        version++
        listeners.forEach((l) => l())
      })
  }
  return null
}

/** Re-render when a photo arrives. Returns a number that changes each time. */
export function usePhotos(): number {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => version,
  )
}

/** How much to multiply the photo by, per channel (linear light), so its
 *  average colour becomes `color`: 1 for the variant's natural colour, which
 *  shows the photo as it is. Capped so a pale stain over a dark wood doesn't
 *  blow out. */
export function stainFactor(color: string, variant: Variant): Color {
  const want = new Color(color)
  const natural = new Color(variant.natural)
  const ratio = (a: number, b: number) => Math.min(4, a / Math.max(b, 1e-4))
  return new Color(ratio(want.r, natural.r), ratio(want.g, natural.g), ratio(want.b, natural.b))
}
