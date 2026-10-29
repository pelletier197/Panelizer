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

/** Selectable imperial working precisions — the fraction denominator a document
 *  snaps to (1/4 … 1/64). Metric always works to 1 mm. */
export const IMPERIAL_PRECISIONS = [4, 8, 16, 32, 64] as const
export const DEFAULT_PRECISION = 16

/** The grid step (mm) a document snaps to: 1"/`precision` in imperial (e.g.
 *  1/16"), 1 mm in metric (`precision` is ignored). */
export function gridStepMm(unit: Unit, precision: number): number {
  return unit === 'inch' ? 25.4 / precision : 1
}

/** Snap a millimetre value onto the document grid, so what you see is exactly
 *  what's stored (a part shown as 13 1/2" is stored as exactly 13 1/2", and
 *  identical parts are byte-identical, so they group). */
export function roundToUnitGrid(mm: number, unit: Unit, precision: number): number {
  const step = gridStepMm(unit, precision)
  return Math.round(mm / step) * step
}

/** Whether two units are the same measuring system (metric vs imperial), used to
 *  reject cross-system entry in a single-unit document. */
export function sameSystem(a: Unit, b: Unit): boolean {
  const imperial = (u: Unit) => u === 'inch'
  return imperial(a) === imperial(b)
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
 *   `25 5/8 - 3 * 1/2` → 24 1/8 (`*` / `/` before `+` / `-`)
 *
 * Usual precedence, no parentheses — a field calculator, not a full expression
 * engine. Returns `null` if anything fails to parse.
 */
export function evaluateMeasurement(raw: string, currentMm: number, defaultUnit: Unit): EvalResult | null {
  const text = normalizeFractions(raw).trim()
  if (!text) return null

  const tokens = tokenize(padOperators(text))

  // No operators: a plain measurement — keep the existing unit-aware behaviour,
  // including adopting an explicitly typed unit.
  if (!tokens.some((t) => 'op' in t)) {
    const mm = parseMeasurement(text, defaultUnit)
    return mm === null ? null : { mm, explicitUnit: detectDisplayUnit(text) }
  }

  // An expression always keeps the box's own unit.
  const mm = foldExpression(tokens, currentMm, defaultUnit)
  return mm === null ? null : { mm, explicitUnit: null }
}

/** One element of a field expression: an operator, or a value term (which may
 *  itself be a multi-word mixed number like `23 3/4`). */
type Token = { op: string } | { term: string }

const isOperator = (t: string) => t === '+' || t === '-' || t === '*' || t === '/'

/**
 * Make spaces optional around operators. `+` and `*` never appear inside a
 * number, so pad them freely. A `-` is only an operator when it directly
 * follows a value (digit / inch-mark / `)`); a leading or post-operator `-`
 * stays the sign of a negative literal. `/` is left alone — bare `3/4` is a
 * fraction (and `600/2` reads the same either way).
 */
function padOperators(text: string): string {
  return text
    .replace(/^\//, '/ ') // leading `/` is a relative divide (`/2` halves)
    .replace(/([+*])/g, ' $1 ')
    .replace(/([\d"')])\s*-\s*/g, '$1 - ')
}

/** Split on whitespace, regrouping consecutive value tokens into single terms
 *  so a mixed fraction like `23 3/4` survives as one operand. */
function tokenize(padded: string): Token[] {
  const tokens: Token[] = []
  let buffer: string[] = []
  const flush = () => {
    if (buffer.length) {
      tokens.push({ term: buffer.join(' ') })
      buffer = []
    }
  }

  for (const token of padded.split(/\s+/).filter(Boolean)) {
    if (isOperator(token)) {
      flush()
      tokens.push({ op: token })
    } else {
      buffer.push(token)
    }
  }
  flush()

  return tokens
}

/**
 * Evaluate a token sequence with the usual precedence: `*` and `/` bind
 * tighter than `+` and `-`, so `25 5/8 - 3 * 1/2` is `25 5/8 - 1 1/2`. Each
 * product starts from a measurement and is scaled by plain numbers. A leading
 * operator starts from `currentMm`, the box's existing value, so `+3` adds to
 * what's already there and `/2` halves it. Returns null if any operand fails to
 * parse.
 */
function foldExpression(tokens: Token[], currentMm: number, defaultUnit: Unit): number | null {
  let i = 0

  // A measurement operand: the start of every product.
  const measurement = (): number | null => {
    const t = tokens[i]
    if (!t || !('term' in t)) return null
    i++
    return parseMeasurement(t.term, defaultUnit)
  }

  // `start` scaled by any run of `* n` / `/ n` that follows it.
  const product = (start: number | null): number | null => {
    let acc = start
    while (acc !== null && i < tokens.length) {
      const opToken = tokens[i]
      if (!('op' in opToken) || (opToken.op !== '*' && opToken.op !== '/')) break
      const termToken = tokens[i + 1]
      if (!termToken || !('term' in termToken)) return null
      const n = parseNumeric(termToken.term) // `*` / `/` take a plain scalar
      if (n === null || (opToken.op === '/' && n === 0)) return null
      acc = opToken.op === '*' ? acc * n : acc / n
      i += 2
    }
    return acc
  }

  let total = product('op' in tokens[0] ? currentMm : measurement())
  while (total !== null && i < tokens.length) {
    const opToken = tokens[i++]
    if (!('op' in opToken)) return null
    const next = product(measurement())
    if (next === null) return null
    total = opToken.op === '+' ? total + next : total - next
  }
  return total
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
 *  shop-friendly fractions to the nearest 1/64" (fine enough that a value on any
 *  supported precision grid — 1/4 … 1/64 — shows as its exact reduced fraction);
 *  metric renders as decimals to a tenth of a millimetre, trailing zeros
 *  trimmed. Sizes on the 1 mm grid still read as whole numbers; finer values
 *  that are meant to be fine (a 2.6 mm kerf) show as typed instead of rounding
 *  to a number that isn't stored. */
export function formatMeasurement(mm: number, unit: Unit): string {
  const value = fromMm(mm, unit)
  if (unit === 'inch') return formatInches(value)
  const decimals = unit === 'mm' ? 1 : 2
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

/** Reduce a sixty-fourth to lowest terms. The denominator is always a power of
 *  two, so halving while both parts are even is enough — no GCD needed. */
function reduceFraction(numerator: number, denominator: number): [number, number] {
  while (numerator % 2 === 0 && denominator % 2 === 0) {
    numerator /= 2
    denominator /= 2
  }
  return [numerator, denominator]
}

/** An inch value split into the pieces both renderings need. */
function inchParts(value: number) {
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const whole = Math.floor(abs)
  const sixtyFourths = Math.round((abs - whole) * 64)

  if (sixtyFourths === 64) return { sign, whole: whole + 1, fraction: null }
  if (sixtyFourths === 0) return { sign, whole, fraction: null }

  const [numerator, denominator] = reduceFraction(sixtyFourths, 64)
  return { sign, whole, fraction: { numerator, denominator } }
}

function formatInches(value: number): string {
  const { sign, whole, fraction } = inchParts(value)
  if (!fraction) return `${sign}${whole}`

  // Compact mixed number: no space between whole and fraction, fraction drawn
  // small (`23³⁄₄`). A bare fraction (whole 0) drops the leading `0`.
  const glyph = `${glyphs(fraction.numerator, SUP)}⁄${glyphs(fraction.denominator, SUB)}`
  return whole > 0 ? `${sign}${whole}${glyph}` : `${sign}${glyph}`
}

/**
 * The same value as {@link formatMeasurement}, but written in plain ASCII
 * (`23 3/4`) instead of compact glyphs (`23³⁄₄`).
 *
 * This is what a field shows while it has focus. The glyph form is lovely to
 * read in a table but miserable to edit — the caret has to step through
 * single-character superscripts and a fraction slash, and backspacing leaves
 * nonsense. Only the display form differs; both parse back to the same value.
 */
export function formatMeasurementPlain(mm: number, unit: Unit): string {
  if (unit !== 'inch') return formatMeasurement(mm, unit)

  const { sign, whole, fraction } = inchParts(fromMm(mm, unit))
  if (!fraction) return `${sign}${whole}`

  const plain = `${fraction.numerator}/${fraction.denominator}`
  return whole > 0 ? `${sign}${whole} ${plain}` : `${sign}${plain}`
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
