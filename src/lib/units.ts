/**
 * Units are a display/entry concern only — everything is stored internally in
 * millimetres. A design has one *default* unit (used for bare numbers and as
 * the starting display unit), but any field can be entered in another unit by
 * typing it explicitly (e.g. `24.5 in`), and imperial fractions are understood.
 */
export type Unit = 'mm' | 'cm' | 'inch'

export const DOCUMENT_UNITS: { value: Unit; label: string }[] = [
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
  { value: 'inch', label: 'inch' },
]

/** Short suffix shown next to inputs and in the parts-table headers. */
export const UNIT_SUFFIX: Record<Unit, string> = { mm: 'mm', cm: 'cm', inch: 'in' }

const MM_PER_UNIT: Record<Unit, number> = { mm: 1, cm: 10, inch: 25.4 }

/** Units accepted when *typing* a value. Wider than the selectable document
 *  units: metres and feet are convenient to enter even if we never display in
 *  them. Keys are matched case-insensitively against the typed suffix. */
const INPUT_UNIT_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  inch: 25.4,
  inches: 25.4,
  '"': 25.4,
  ft: 304.8,
  foot: 304.8,
  feet: 304.8,
  "'": 304.8,
}

export function toMm(value: number, unit: Unit): number {
  return value * MM_PER_UNIT[unit]
}

/** Whether the document unit is imperial (inches), so defaults should be clean
 *  imperial sizes rather than clean metric ones. */
export function isImperial(unit: Unit): boolean {
  return unit === 'inch'
}

export function fromMm(mm: number, unit: Unit): number {
  return mm / MM_PER_UNIT[unit]
}

/**
 * Parse a free-text measurement into millimetres, or `null` if it makes no
 * sense. Accepts decimals (`24.5`), whole+fraction (`23 3/4`), bare fractions
 * (`3/4`) and an optional trailing unit; a bare number uses `defaultUnit`.
 */
export function parseMeasurement(raw: string, defaultUnit: Unit): number | null {
  const text = normalizeFractions(raw).trim().toLowerCase()
  if (!text) return null

  const match = text.match(/^([0-9./\s-]+?)\s*([a-z"']*)$/)
  if (!match) return null
  const [, numberPart, unitPart] = match

  const mmPerUnit = unitPart ? INPUT_UNIT_MM[unitPart] : MM_PER_UNIT[defaultUnit]
  if (mmPerUnit === undefined) return null

  const value = parseNumeric(numberPart)
  return value === null ? null : value * mmPerUnit
}

/** Result of evaluating a field's text: the value in mm, plus the display unit
 *  it should adopt (only a plain single measurement adopts a typed unit; an
 *  arithmetic expression keeps the box's current unit). */
export interface EvalResult {
  mm: number
  explicitUnit: Unit | null
}

/**
 * Evaluate a measurement field's text, supporting simple arithmetic on top of
 * {@link parseMeasurement}. Operators (`+ - * /`) need no surrounding spaces —
 * they're auto-padded, while fractions (`3/4`), mixed numbers (`23 3/4`) and
 * negative literals (`-17`) are left intact:
 *
 *   `30+15+2-3`        → 44 (in the box's unit)
 *   `+3`               → current value + 3
 *   `600/2`            → 300      (`*` / `/` take a plain scalar)
 *   `23 3/4 + 1/2 in`  → mixed units, result kept in the box's unit
 *
 * Evaluation is strictly left to right (no precedence) — a field calculator,
 * not a full expression engine. Returns `null` if anything fails to parse.
 */
export function evaluateMeasurement(raw: string, currentMm: number, defaultUnit: Unit): EvalResult | null {
  const text = normalizeFractions(raw).trim()
  if (!text) return null

  const isOp = (t: string) => t === '+' || t === '-' || t === '*' || t === '/'

  // Make spaces optional around operators. `+` and `*` never appear inside a
  // number, so pad them freely. A `-` is only an operator when it directly
  // follows a value (digit / inch-mark / `)`); a leading or post-operator `-`
  // stays the sign of a negative literal. `/` is left alone — bare `3/4` is a
  // fraction (and `600/2` reads the same either way).
  const padded = text
    .replace(/^\//, '/ ') // leading `/` is a relative divide (`/2` halves)
    .replace(/([+*])/g, ' $1 ')
    .replace(/([\d"')])\s*-\s*/g, '$1 - ')

  // Split on whitespace, then regroup consecutive value tokens into single
  // terms so a mixed fraction like "23 3/4" survives as one operand.
  const seq: ({ op: string } | { term: string })[] = []
  let buffer: string[] = []
  const flush = () => {
    if (buffer.length) {
      seq.push({ term: buffer.join(' ') })
      buffer = []
    }
  }
  for (const token of padded.split(/\s+/).filter(Boolean)) {
    if (isOp(token)) {
      flush()
      seq.push({ op: token })
    } else {
      buffer.push(token)
    }
  }
  flush()

  // No operators: a plain measurement — keep the existing unit-aware behaviour,
  // including adopting an explicitly typed unit.
  if (!seq.some((s) => 'op' in s)) {
    const mm = parseMeasurement(text, defaultUnit)
    return mm === null ? null : { mm, explicitUnit: detectDisplayUnit(text) }
  }

  // Expression: fold left to right. A leading operator starts from the box's
  // current value; the result stays in the box's unit.
  let acc: number
  let i: number
  const first = seq[0]
  if ('op' in first) {
    acc = currentMm
    i = 0
  } else {
    const m = parseMeasurement(first.term, defaultUnit)
    if (m === null) return null
    acc = m
    i = 1
  }

  for (; i < seq.length; i += 2) {
    const opTok = seq[i]
    const termTok = seq[i + 1]
    if (!opTok || !('op' in opTok) || !termTok || !('term' in termTok)) return null
    const op = opTok.op
    if (op === '+' || op === '-') {
      const m = parseMeasurement(termTok.term, defaultUnit)
      if (m === null) return null
      acc = op === '+' ? acc + m : acc - m
    } else {
      const n = parseNumeric(termTok.term) // `*` / `/` take a plain scalar
      if (n === null || (op === '/' && n === 0)) return null
      acc = op === '*' ? acc * n : acc / n
    }
  }
  return { mm: acc, explicitUnit: null }
}

function parseNumeric(part: string): number | null {
  const text = part.trim()

  const mixed = text.match(/^(-?\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/) // "23 3/4"
  if (mixed) {
    const whole = parseFloat(mixed[1])
    const den = Number(mixed[3])
    if (den === 0) return null
    const sign = whole < 0 ? -1 : 1
    return whole + sign * (Number(mixed[2]) / den)
  }

  const fraction = text.match(/^(-?\d+)\/(\d+)$/) // "3/4"
  if (fraction) {
    const den = Number(fraction[2])
    return den === 0 ? null : Number(fraction[1]) / den
  }

  return /^-?\d+(?:\.\d+)?$/.test(text) ? parseFloat(text) : null
}

/** Format a millimetre value for display in the given unit. Inches render as
 *  shop-friendly fractions to the nearest 1/16"; metric renders as decimals. */
export function formatMeasurement(mm: number, unit: Unit): string {
  const value = fromMm(mm, unit)
  if (unit === 'inch') return formatInches(value)
  const decimals = unit === 'mm' ? 0 : 1
  return trimZeros(value.toFixed(decimals))
}

// Superscript / subscript digit glyphs, used to render inch fractions compactly
// (e.g. `22¹³⁄₁₆`) so the parts table and readouts don't sprawl. `⁄` is the
// Unicode fraction slash (U+2044). `normalizeFractions` reverses all of this so
// a displayed value can still be typed back into a field.
const SUP = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']
const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉']
const glyphs = (n: number, table: string[]) =>
  String(n)
    .split('')
    .map((d) => table[Number(d)])
    .join('')

function formatInches(value: number): string {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const whole = Math.floor(abs)

  let numerator = Math.round((abs - whole) * 16)
  let denominator = 16
  if (numerator === 16) return `${sign}${whole + 1}`
  if (numerator === 0) return `${sign}${whole}`

  while (numerator % 2 === 0 && denominator % 2 === 0) {
    numerator /= 2
    denominator /= 2
  }
  // Compact mixed number: no space between whole and fraction, fraction drawn
  // small (`23³⁄₄`). A bare fraction (whole 0) drops the leading `0`.
  const fraction = `${glyphs(numerator, SUP)}⁄${glyphs(denominator, SUB)}`
  return whole > 0 ? `${sign}${whole}${fraction}` : `${sign}${fraction}`
}

/** Reverse of the compact inch glyphs, so a displayed value (`23³⁄₄`) still
 *  parses when typed back into a field. Superscript digits become the fraction
 *  numerator — split from the whole number with a space so `23³⁄₄` reads as the
 *  mixed number `23 3/4`, but only when a whole number actually precedes them
 *  (a bare fraction or a negative sign must stay glued to the numerator). */
function normalizeFractions(text: string): string {
  const sub = (c: string) => String(SUB.indexOf(c))
  return text
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, sub)
    .replace(/⁄/g, '/')
    .replace(/([0-9])?([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (_, pre: string | undefined, run: string) => {
      const digits = run
        .split('')
        .map((c) => String(SUP.indexOf(c)))
        .join('')
      return pre !== undefined ? `${pre} ${digits}` : digits
    })
}

/** Map an explicitly-typed unit suffix to the display unit a field should
 *  adopt. Metres collapse to cm, feet to inches (we don't display those). */
export function detectDisplayUnit(raw: string): Unit | null {
  const token = raw.trim().toLowerCase().match(/[a-z"']+$/)?.[0]
  if (!token) return null
  if (token === 'mm') return 'mm'
  if (token === 'cm' || token === 'm') return 'cm'
  if (['in', 'inch', 'inches', '"', 'ft', 'feet', 'foot', "'"].includes(token)) return 'inch'
  return null
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}
