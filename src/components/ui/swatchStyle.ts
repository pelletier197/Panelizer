import type { CSSProperties } from 'react'
import { variantOf, type Finish, type Variant } from '../../lib/finishes'
import type { Material } from '../../lib/materials'
import { drawPattern } from '../../lib/patterns'
import { photoOf, stainFactor } from '../viewport/photos'

/** Small pattern tiles as image URLs, for swatches; drawn once each. */
const swatchImages = new Map<string, string | null>()

function patternImage(finish: Finish | undefined, variant: string | undefined): string | null {
  const key = `${finish}:${variant}`
  if (swatchImages.has(key)) return swatchImages.get(key)!
  const tile = drawPattern(finish, variant, 64)
  let url: string | null = null
  if (tile) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = tile.size
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const image = ctx.createImageData(tile.size, tile.size)
      tile.grey.forEach((g, i) => image.data.set([g, g, g, 255], i * 4))
      ctx.putImageData(image, 0, 0)
      url = canvas.toDataURL()
    }
  }
  swatchImages.set(key, url)
  return url
}

/** Stained photo swatches as image URLs, one per variant and colour. */
const photoSwatches = new Map<string, string>()
const SWATCH_PX = 64

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)

/** A small copy of the variant's photo, stained as the 3D view stains it, or
 *  null while the photo hasn't loaded. */
function photoSwatch(variant: Variant, color: string): string | null {
  const key = `${variant.id}:${color}`
  const cached = photoSwatches.get(key)
  if (cached) return cached
  const photo = photoOf(variant)
  if (!photo) return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SWATCH_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(photo.image, 0, 0, SWATCH_PX, SWATCH_PX)
  const pixels = ctx.getImageData(0, 0, SWATCH_PX, SWATCH_PX)
  const f = stainFactor(color, variant)
  const factor = [f.r, f.g, f.b]
  for (let i = 0; i < pixels.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = toLinear(pixels.data[i + c] / 255) * factor[c]
      pixels.data[i + c] = Math.round(255 * toSrgb(Math.min(1, v)))
    }
  }
  ctx.putImageData(pixels, 0, 0)
  const url = canvas.toDataURL()
  photoSwatches.set(key, url)
  return url
}

/** The CSS for a swatch of a look: the stained photo once it's loaded (call
 *  `usePhotos` to re-render then), else the colour over its drawn pattern,
 *  or the flat colour for paint. */
export function swatchStyle({ color, finish, variant }: Pick<Material, 'color' | 'finish' | 'variant'>): CSSProperties {
  const v = variantOf(finish, variant)
  const photo = v && photoSwatch(v, color)
  if (photo) return { backgroundImage: `url(${photo})`, backgroundSize: 'cover' }
  const image = patternImage(finish, variant)
  return image
    ? { backgroundColor: color, backgroundImage: `url(${image})`, backgroundBlendMode: 'multiply', backgroundSize: '200%' }
    : { backgroundColor: color }
}
