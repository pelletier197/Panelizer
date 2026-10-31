import {
  BufferAttribute,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Vector2,
  type BufferGeometry,
  type Color,
  type Texture,
} from 'three'
import type { Panel } from '../../types/panel'
import { axisField } from '../../lib/geometry'
import { finishInfo, variantOf } from '../../lib/finishes'
import type { Material } from '../../lib/materials'
import { drawPattern } from '../../lib/patterns'
import { photoOf, stainFactor } from './photos'

/**
 * How a material is drawn on a panel: its colour, the finish's texture and
 * relief, and how it catches the light.
 */
export interface Look {
  /** The paint colour; over a photo, the stain's factor on it. */
  color: string | Color
  map: Texture | null
  normalMap: Texture | null
  normalScale: Vector2
  roughness: number
  metalness: number
}

/** One drawn texture per pattern, shared by every panel that uses it; drawn
 *  the first time it's needed, and shown until the photo arrives. */
const textures = new Map<string, DataTexture | null>()

function textureFor(material: Material): DataTexture | null {
  const key = `${material.finish}:${material.variant}`
  if (textures.has(key)) return textures.get(key)!
  const tile = drawPattern(material.finish, material.variant)
  let texture: DataTexture | null = null
  if (tile) {
    const rgba = new Uint8Array(tile.size * tile.size * 4)
    tile.grey.forEach((g, i) => rgba.set([g, g, g, 255], i * 4))
    texture = new DataTexture(rgba, tile.size, tile.size, RGBAFormat)
    texture.colorSpace = SRGBColorSpace
    texture.wrapS = texture.wrapT = RepeatWrapping
    // Texture coordinates are in metres (see `applyPanelUVs`): one repeat per
    // tile's worth of surface.
    texture.repeat.set(1 / tile.metres, 1 / tile.metres)
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.generateMipmaps = true
    texture.anisotropy = 8
    texture.needsUpdate = true
  }
  textures.set(key, texture)
  return texture
}

/**
 * The look of a material: the finish's photo tinted by its stain once the
 * photo has loaded, the drawn pattern tinted by its colour until then, or the
 * flat colour for paint. Components using it re-render when a photo arrives
 * (`usePhotos`).
 *
 * Without an environment to reflect, metal renders nearly black, so the
 * editing view (`realistic` off) keeps it only a little metallic; the
 * presentation view has one and shows it fully.
 */
export function lookOf(material: Material, realistic = false): Look {
  const info = finishInfo(material.finish)
  const variant = variantOf(material.finish, material.variant)
  const photo = variant ? photoOf(variant) : null
  const relief = variant?.photo.relief ?? 0
  return {
    color: photo && variant ? stainFactor(material.color, variant) : material.color,
    map: photo?.color ?? textureFor(material),
    normalMap: photo?.normal ?? null,
    normalScale: new Vector2(relief, relief),
    roughness: info.roughness,
    metalness: realistic ? info.metalness : Math.min(info.metalness, 0.35),
  }
}

/** A small, stable offset (m) per panel, so boards cut from the same pattern
 *  don't all show the identical stretch of it. */
function offsetFor(id: string): [number, number] {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return [((h >>> 0) % 1000) / 1000, ((h >>> 10) % 1000) / 1000]
}

/**
 * Give a panel's geometry texture coordinates in metres, so a pattern keeps
 * its real-world scale on any size of part. On each face, the first
 * coordinate runs along the part's grain (its length unless the grain is set
 * to its width) and the second across it; on the ends, where the grain runs
 * into the face, along the other face edge, then the thickness.
 */
export function applyPanelUVs(geometry: BufferGeometry, panel: Pick<Panel, 'id' | 'normal' | 'grain'>): void {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const along = ([0, 1, 2] as const).find((a) => axisField(panel.normal, a) === (panel.grain === 'width' ? 'width' : 'length'))!
  const across = ([0, 1, 2] as const).find((a) => a !== along && axisField(panel.normal, a) !== 'thickness')!
  const thick = ([0, 1, 2] as const).find((a) => axisField(panel.normal, a) === 'thickness')!
  const [ou, ov] = offsetFor(panel.id)

  const uv = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i++) {
    const n = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i)), Math.abs(normal.getZ(i))]
    const facing = n.indexOf(Math.max(...n))
    // Axes of the face this vertex belongs to: the grain wherever it lies in
    // the face, else the other face edge; then whatever's left.
    const [a, b] =
      facing === thick ? [along, across] : facing === across ? [along, thick] : [across, thick]
    const coord = (axis: number) => position.getComponent(i, axis)
    uv[i * 2] = coord(a) + ou
    uv[i * 2 + 1] = coord(b) + ov
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
}
