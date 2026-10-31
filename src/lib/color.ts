/**
 * Colours as people choose them — hue, saturation, lightness — and as
 * materials store them, `#rrggbb`.
 */

/** Hue in degrees [0, 360), saturation and lightness in percent [0, 100]. */
export interface Hsl {
  h: number
  s: number
  l: number
}

/** `#rrggbb` to HSL. Greys have no hue of their own; they report 0. */
export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: l * 100 }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 }
}

/** HSL to `#rrggbb`. */
export function hslToHex({ h, s, l }: Hsl): string {
  const sat = Math.min(100, Math.max(0, s)) / 100
  const light = Math.min(100, Math.max(0, l)) / 100
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const hue = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hue % 2) - 1))
  const [r, g, b] =
    hue < 1 ? [c, x, 0] : hue < 2 ? [x, c, 0] : hue < 3 ? [0, c, x] : hue < 4 ? [0, x, c] : hue < 5 ? [x, 0, c] : [c, 0, x]
  const m = light - c / 2
  return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')
}

/** A CSS colour for an HSL value. */
export const cssHsl = ({ h, s, l }: Hsl) => `hsl(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%)`
