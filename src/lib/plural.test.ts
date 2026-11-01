import { describe, expect, it } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('matches the noun to the count', () => {
    expect(plural(0, 'panel')).toBe('0 panels')
    expect(plural(1, 'panel')).toBe('1 panel')
    expect(plural(2, 'sheet good')).toBe('2 sheet goods')
  })

  it('takes an irregular plural', () => {
    expect(plural(1, 'shelf', 'shelves')).toBe('1 shelf')
    expect(plural(4, 'shelf', 'shelves')).toBe('4 shelves')
  })
})
