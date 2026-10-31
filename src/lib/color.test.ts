import { describe, expect, it } from 'vitest'
import { hexToHsl, hslToHex } from './color'

describe('hexToHsl / hslToHex', () => {
  it('reads the primaries and greys', () => {
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 })
    expect(hexToHsl('#00ff00')).toEqual({ h: 120, s: 100, l: 50 })
    expect(hexToHsl('#0000ff')).toEqual({ h: 240, s: 100, l: 50 })
    expect(hexToHsl('#808080')).toEqual({ h: 0, s: 0, l: expect.closeTo(50.2, 1) })
  })

  it('writes them back', () => {
    expect(hslToHex({ h: 0, s: 100, l: 50 })).toBe('#ff0000')
    expect(hslToHex({ h: 210, s: 0, l: 100 })).toBe('#ffffff')
    expect(hslToHex({ h: 30, s: 50, l: 0 })).toBe('#000000')
  })

  it('round-trips furniture colours exactly', () => {
    for (const hex of ['#2f3d55', '#a3ad92', '#ece6d8', '#7c644e', '#3f2a1e', '#c9a35b']) {
      expect(hslToHex(hexToHsl(hex))).toBe(hex)
    }
  })

  it('keeps out-of-range input in range', () => {
    expect(hslToHex({ h: 390, s: 140, l: -5 })).toBe('#000000')
    expect(hslToHex({ h: -330, s: 100, l: 50 })).toBe(hslToHex({ h: 30, s: 100, l: 50 }))
  })
})
