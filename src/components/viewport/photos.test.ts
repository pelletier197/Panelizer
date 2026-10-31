import { describe, expect, it } from 'vitest'
import { FINISHES, variantOf } from '../../lib/finishes'
import { stainFactor } from './photos'

const oak = variantOf('wood', 'oak')!

describe('stainFactor', () => {
  it('leaves the photo as it is in its natural colour', () => {
    const f = stainFactor(oak.natural, oak)
    expect(f.r).toBeCloseTo(1)
    expect(f.g).toBeCloseTo(1)
    expect(f.b).toBeCloseTo(1)
  })

  it('darkens for a darker stain and lightens for a lighter one', () => {
    expect(stainFactor('#2a211c', oak).r).toBeLessThan(1)
    expect(stainFactor('#e6ddcd', oak).r).toBeGreaterThan(1)
  })

  it("caps how far a pale stain can lift a dark wood's photo", () => {
    const walnut = variantOf('wood', 'walnut')!
    expect(stainFactor('#ffffff', walnut).r).toBeLessThanOrEqual(4)
  })

  it('has a photo, with a natural colour, for every variant', () => {
    for (const v of FINISHES.flatMap((f) => f.variants)) {
      expect(v.natural).toMatch(/^#[0-9a-f]{6}$/)
      expect(v.photo.metres).toBeGreaterThan(0)
    }
  })
})
