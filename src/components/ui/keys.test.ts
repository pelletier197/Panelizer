import { describe, expect, it } from 'vitest'
import { formatKeys } from './keys'

describe('formatKeys', () => {
  it('leaves combos alone off a Mac', () => {
    expect(formatKeys('Ctrl+D', false)).toBe('Ctrl+D')
    expect(formatKeys('Del', false)).toBe('Del')
  })

  it('writes Mac symbols on a Mac', () => {
    expect(formatKeys('Ctrl+D', true)).toBe('⌘D')
    expect(formatKeys('Alt+H', true)).toBe('⌥H')
    expect(formatKeys('Ctrl+Shift+Z', true)).toBe('⌘⇧Z')
    expect(formatKeys('Del', true)).toBe('⌫')
    expect(formatKeys('F', true)).toBe('F')
    // A modifier on its own, as in a "hold Ctrl" hint.
    expect(formatKeys('Ctrl', true)).toBe('⌘')
    expect(formatKeys('Shift', true)).toBe('⇧')
  })
})
