import { describe, expect, it } from 'vitest'
import {
  detectDisplayUnit,
  evaluateMeasurement,
  formatMeasurement,
  formatMeasurementPlain,
  fromMm,
  gridStepMm,
  isImperial,
  parseMeasurement,
  roundToUnitGrid,
  sameSystem,
  toMm,
} from './units'

/**
 * Characterization tests: these pin the CURRENT behaviour of the measurement
 * layer so the planned refactor (splitting `evaluateMeasurement` into
 * tokenize/fold helpers, extracting `reduceFraction`) can be proven not to
 * change a single result. Where behaviour looks quirky it is still asserted —
 * the point is to freeze it, not to judge it.
 */

const IN = 25.4

describe('toMm / fromMm', () => {
  it('converts each document unit', () => {
    expect(toMm(1, 'mm')).toBe(1)
    expect(toMm(1, 'cm')).toBe(10)
    expect(toMm(1, 'inch')).toBe(IN)
    expect(fromMm(25.4, 'inch')).toBeCloseTo(1, 10)
    expect(fromMm(10, 'cm')).toBe(1)
  })
})

describe('gridStepMm / roundToUnitGrid', () => {
  it('is 1mm for metric regardless of precision', () => {
    expect(gridStepMm('mm', 16)).toBe(1)
    expect(gridStepMm('cm', 64)).toBe(1)
  })

  it('is one fraction of an inch in imperial', () => {
    expect(gridStepMm('inch', 16)).toBeCloseTo(IN / 16, 10)
    expect(gridStepMm('inch', 4)).toBeCloseTo(IN / 4, 10)
  })

  it('snaps onto the grid', () => {
    expect(roundToUnitGrid(10.4, 'mm', 16)).toBe(10)
    expect(roundToUnitGrid(10.6, 'mm', 16)).toBe(11)
    // 13 1/2" stays exactly 13 1/2" on a 1/16 grid
    expect(roundToUnitGrid(13.5 * IN, 'inch', 16)).toBeCloseTo(13.5 * IN, 10)
    // a hair off 3/4" pulls back onto it
    expect(roundToUnitGrid(0.752 * IN, 'inch', 16)).toBeCloseTo(0.75 * IN, 10)
  })
})

describe('sameSystem / isImperial', () => {
  it('groups metric together and inch apart', () => {
    expect(sameSystem('mm', 'cm')).toBe(true)
    expect(sameSystem('mm', 'inch')).toBe(false)
    expect(sameSystem('inch', 'inch')).toBe(true)
    expect(isImperial('inch')).toBe(true)
    expect(isImperial('mm')).toBe(false)
  })
})

describe('parseMeasurement', () => {
  it('parses a bare number in the default unit', () => {
    expect(parseMeasurement('24', 'mm')).toBe(24)
    expect(parseMeasurement('2', 'cm')).toBe(20)
    expect(parseMeasurement('2', 'inch')).toBeCloseTo(2 * IN, 10)
  })

  it('parses decimals', () => {
    expect(parseMeasurement('24.5', 'mm')).toBeCloseTo(24.5, 10)
  })

  it('parses an explicit trailing unit, overriding the default', () => {
    expect(parseMeasurement('24.5 in', 'mm')).toBeCloseTo(24.5 * IN, 10)
    expect(parseMeasurement('1 ft', 'mm')).toBeCloseTo(304.8, 10)
    expect(parseMeasurement('1 m', 'mm')).toBe(1000)
    expect(parseMeasurement('5cm', 'mm')).toBe(50)
    expect(parseMeasurement('3"', 'mm')).toBeCloseTo(3 * IN, 10)
    expect(parseMeasurement("2'", 'mm')).toBeCloseTo(2 * 304.8, 10)
  })

  it('parses bare and mixed fractions', () => {
    expect(parseMeasurement('3/4', 'inch')).toBeCloseTo(0.75 * IN, 10)
    expect(parseMeasurement('23 3/4', 'inch')).toBeCloseTo(23.75 * IN, 10)
    expect(parseMeasurement('23 3/4 in', 'mm')).toBeCloseTo(23.75 * IN, 10)
  })

  it('parses negative values', () => {
    expect(parseMeasurement('-17', 'mm')).toBe(-17)
  })

  it('round-trips the compact glyph form it renders', () => {
    // formatMeasurement emits `23³⁄₄`; typing that back must parse.
    const shown = formatMeasurement(23.75 * IN, 'inch')
    expect(parseMeasurement(shown, 'inch')).toBeCloseTo(23.75 * IN, 8)
  })

  it('rejects nonsense', () => {
    expect(parseMeasurement('', 'mm')).toBeNull()
    expect(parseMeasurement('   ', 'mm')).toBeNull()
    expect(parseMeasurement('abc', 'mm')).toBeNull()
    expect(parseMeasurement('12 furlongs', 'mm')).toBeNull()
    expect(parseMeasurement('3/0', 'mm')).toBeNull()
  })
})

describe('evaluateMeasurement', () => {
  const evalMm = (raw: string, current = 0, unit: 'mm' | 'cm' | 'inch' = 'mm') =>
    evaluateMeasurement(raw, current, unit)

  it('treats a plain measurement as a parse, and adopts an explicit unit', () => {
    expect(evalMm('30')).toEqual({ mm: 30, explicitUnit: null })
    expect(evalMm('2 in')?.mm).toBeCloseTo(2 * IN, 10)
    expect(evalMm('2 in')?.explicitUnit).toBe('inch')
    // metres collapse to cm, feet to inch — we never display those
    expect(evalMm('1 m')?.explicitUnit).toBe('cm')
    expect(evalMm('1 ft')?.explicitUnit).toBe('inch')
  })

  it('adds and subtracts left to right', () => {
    expect(evalMm('30+15+2-3')?.mm).toBeCloseTo(44, 10)
  })

  it('multiplies and divides before adding and subtracting (issue #3)', () => {
    expect(evalMm('2+3*4')?.mm).toBeCloseTo(14, 10)
    expect(evalMm('100-60/2')?.mm).toBeCloseTo(70, 10)
    expect(evalMm('10*2+5*3')?.mm).toBeCloseTo(35, 10)
    // The reported case: 25 5/8 - (3 * 1/2) = 24 1/8.
    expect(evalMm('25 5/8 - 3 * 1/2', 0, 'inch')?.mm).toBeCloseTo(24.125 * IN, 8)
    expect(evalMm('25 5/8-3*1/2', 0, 'inch')?.mm).toBeCloseTo(24.125 * IN, 8)
  })

  it('chains products left to right', () => {
    // Spaced: an unspaced `/` doubles as the fraction bar.
    expect(evalMm('600 / 2 / 3')?.mm).toBeCloseTo(100, 10)
    expect(evalMm('10*3/2')?.mm).toBeCloseTo(15, 10)
  })

  it('applies a leading operator to the current value, then the rest by precedence', () => {
    expect(evalMm('/2+10', 100)?.mm).toBeCloseTo(60, 10)
    expect(evalMm('+3*2', 100)?.mm).toBeCloseTo(106, 10)
  })

  it('starts from the current value when it leads with an operator', () => {
    expect(evalMm('+3', 100)?.mm).toBeCloseTo(103, 10)
    expect(evalMm('/2', 100)?.mm).toBeCloseTo(50, 10)
    expect(evalMm('*2', 100)?.mm).toBeCloseTo(200, 10)
  })

  it('treats a LEADING minus as a negative literal, not a relative subtract', () => {
    // Deliberate asymmetry with `+3` (see the `-` rule in evaluateMeasurement):
    // a leading `-` is the sign of a negative literal so `-17` can be typed at
    // all. `-3` therefore means "set to -3", NOT "subtract 3 from current".
    // Pinned so the refactor can't quietly make it relative.
    expect(evalMm('-3', 100)?.mm).toBe(-3)
    // A relative subtract needs a value in front of it.
    expect(evalMm('100-3', 100)?.mm).toBeCloseTo(97, 10)
  })

  it('needs no spaces around operators', () => {
    expect(evalMm('30 + 15 - 3')?.mm).toBeCloseTo(42, 10)
    expect(evalMm('30+15-3')?.mm).toBeCloseTo(42, 10)
  })

  it('treats * and / as plain scalars', () => {
    expect(evalMm('600/2')?.mm).toBeCloseTo(300, 10)
    expect(evalMm('10*3')?.mm).toBeCloseTo(30, 10)
  })

  it('keeps a bare fraction a fraction, not a division', () => {
    expect(evalMm('3/4', 0, 'inch')?.mm).toBeCloseTo(0.75 * IN, 10)
  })

  it('keeps a mixed number as one operand', () => {
    const r = evalMm('23 3/4 + 1/2 in', 0, 'inch')
    expect(r?.mm).toBeCloseTo(24.25 * IN, 8)
    // an expression keeps the box's unit rather than adopting a typed one
    expect(r?.explicitUnit).toBeNull()
  })

  it('keeps a negative literal a literal, not an operator', () => {
    expect(evalMm('-17')?.mm).toBe(-17)
  })

  it('mixes units inside one expression', () => {
    expect(evalMm('10 + 1 in')?.mm).toBeCloseTo(10 + IN, 10)
  })

  it('rejects nonsense and divide-by-zero', () => {
    expect(evalMm('')).toBeNull()
    expect(evalMm('  ')).toBeNull()
    expect(evalMm('30 + abc')).toBeNull()
    expect(evalMm('30 * 0 / 0')).toBeNull()
    expect(evalMm('30 +')).toBeNull()
  })
})

describe('formatMeasurement', () => {
  it('renders metric as trimmed decimals, to a tenth of a millimetre', () => {
    expect(formatMeasurement(24, 'mm')).toBe('24')
    expect(formatMeasurement(24.4, 'mm')).toBe('24.4')
    expect(formatMeasurement(24.44, 'mm')).toBe('24.4')
    expect(formatMeasurement(299.99999, 'mm')).toBe('300')
    expect(formatMeasurement(100, 'cm')).toBe('10')
    expect(formatMeasurement(105, 'cm')).toBe('10.5')
    expect(formatMeasurement(2.6, 'cm')).toBe('0.26')
  })

  it('shows a fine kerf as typed (issue #5)', () => {
    expect(formatMeasurement(2.6, 'mm')).toBe('2.6')
  })

  it('renders whole inches without a fraction', () => {
    expect(formatMeasurement(2 * IN, 'inch')).toBe('2')
    expect(formatMeasurement(0, 'inch')).toBe('0')
  })

  it('renders inch fractions as compact reduced glyphs', () => {
    expect(formatMeasurement(0.75 * IN, 'inch')).toBe('³⁄₄')
    expect(formatMeasurement(23.75 * IN, 'inch')).toBe('23³⁄₄')
    expect(formatMeasurement(0.5 * IN, 'inch')).toBe('¹⁄₂')
    // reduces rather than leaving /64
    expect(formatMeasurement(0.25 * IN, 'inch')).toBe('¹⁄₄')
    expect(formatMeasurement((1 / 16) * IN, 'inch')).toBe('¹⁄₁₆')
  })

  it('renders negative inches with a leading sign', () => {
    expect(formatMeasurement(-0.75 * IN, 'inch')).toBe('-³⁄₄')
  })

  it('rounds a hair under a whole inch up to the whole number', () => {
    expect(formatMeasurement(1.9999 * IN, 'inch')).toBe('2')
  })
})

describe('formatMeasurementPlain', () => {
  it('writes inch fractions in ASCII for editing', () => {
    expect(formatMeasurementPlain(0.75 * IN, 'inch')).toBe('3/4')
    expect(formatMeasurementPlain(23.75 * IN, 'inch')).toBe('23 3/4')
    expect(formatMeasurementPlain((1 / 16) * IN, 'inch')).toBe('1/16')
    expect(formatMeasurementPlain(-0.75 * IN, 'inch')).toBe('-3/4')
  })

  it('matches the glyph form for whole inches', () => {
    expect(formatMeasurementPlain(2 * IN, 'inch')).toBe('2')
    expect(formatMeasurementPlain(0, 'inch')).toBe('0')
    expect(formatMeasurementPlain(1.9999 * IN, 'inch')).toBe('2')
  })

  it('is identical to the glyph form in metric', () => {
    for (const mm of [0, 24, 24.4, 105, -12]) {
      expect(formatMeasurementPlain(mm, 'mm')).toBe(formatMeasurement(mm, 'mm'))
      expect(formatMeasurementPlain(mm, 'cm')).toBe(formatMeasurement(mm, 'cm'))
    }
  })

  it('round-trips: both forms parse back to the same value', () => {
    // The point of the swap is that editing changes only the display, never
    // the value the field will commit.
    for (let sixtyFourths = -640; sixtyFourths <= 640; sixtyFourths++) {
      const mm = (sixtyFourths / 64) * IN
      const glyph = formatMeasurement(mm, 'inch')
      const plain = formatMeasurementPlain(mm, 'inch')
      expect(parseMeasurement(plain, 'inch')).toBeCloseTo(parseMeasurement(glyph, 'inch')!, 8)
    }
  })
})

describe('detectDisplayUnit', () => {
  it('maps a typed suffix onto a display unit', () => {
    expect(detectDisplayUnit('5 mm')).toBe('mm')
    expect(detectDisplayUnit('5 cm')).toBe('cm')
    expect(detectDisplayUnit('5 m')).toBe('cm')
    expect(detectDisplayUnit('5 in')).toBe('inch')
    expect(detectDisplayUnit('5"')).toBe('inch')
    expect(detectDisplayUnit('5 ft')).toBe('inch')
    expect(detectDisplayUnit("5'")).toBe('inch')
  })

  it('returns null when no unit was typed', () => {
    expect(detectDisplayUnit('5')).toBeNull()
    expect(detectDisplayUnit('')).toBeNull()
  })
})
