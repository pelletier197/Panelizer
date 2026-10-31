import type { CSSProperties } from 'react'
import type { Finish } from '../../lib/finishes'
import type { Material } from '../../lib/materials'
import { drawPattern } from '../../lib/patterns'

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

/** The CSS for a swatch of a look: the colour, multiplied over its pattern —
 *  the same tinting the 3D view does. */
export function swatchStyle({ color, finish, variant }: Pick<Material, 'color' | 'finish' | 'variant'>): CSSProperties {
  const image = patternImage(finish, variant)
  return image
    ? { backgroundColor: color, backgroundImage: `url(${image})`, backgroundBlendMode: 'multiply', backgroundSize: '200%' }
    : { backgroundColor: color }
}
