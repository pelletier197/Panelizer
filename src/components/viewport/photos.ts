import { useSyncExternalStore } from 'react'
import { Color, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from 'three'
import type { Variant } from '../../lib/finishes'

/**
 * The finish photos (see `public/textures/`), loaded the first time a
 * material uses one — so a design that is all paint never downloads any.
 * Until a photo arrives, callers get null and fall back to the drawn pattern;
 * components re-render when it does (`usePhotos`).
 */

export interface Photo {
  image: HTMLImageElement
  /** Colour texture, one repeat per `metres` of surface (texture coordinates
   *  are in metres, see `applyPanelUVs`). */
  color: Texture
  /** Relief (normal map), when the variant has one. */
  normal: Texture | null
}

const photos = new Map<string, Photo | 'loading' | 'failed'>()
const listeners = new Set<() => void>()
let version = 0

const url = (id: string, kind: 'color' | 'normal') => `${import.meta.env.BASE_URL}textures/${id}-${kind}.webp`

function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image()
  image.decoding = 'async'
  image.src = src
  return image.decode().then(() => image)
}

function texture(image: HTMLImageElement, metres: number, colour: boolean): Texture {
  const t = new Texture(image)
  t.colorSpace = colour ? SRGBColorSpace : NoColorSpace
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(1 / metres, 1 / metres)
  t.anisotropy = 8
  t.needsUpdate = true
  return t
}

/** A variant's photo if it has arrived; otherwise null, and it starts loading. */
export function photoOf(variant: Variant): Photo | null {
  const entry = photos.get(variant.id)
  if (entry && entry !== 'loading' && entry !== 'failed') return entry
  if (!entry) {
    photos.set(variant.id, 'loading')
    const { metres, relief } = variant.photo
    Promise.all([loadImage(url(variant.id, 'color')), relief ? loadImage(url(variant.id, 'normal')) : null])
      .then(([image, normal]) => {
        photos.set(variant.id, {
          image,
          color: texture(image, metres, true),
          normal: normal && texture(normal, metres, false),
        })
      })
      // Offline or missing: keep the drawn pattern.
      .catch(() => photos.set(variant.id, 'failed'))
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
