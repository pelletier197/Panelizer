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
 * Parse a single free-text measurement into millimetres, or `null` if it makes
 * no sense or is an expression. Accepts decimals (`24.5`), whole + fraction
 * (`23 3/4`), bare fractions (`3/4`), feet and inches together (`5' 3"`) and
 * an optional unit; a bare number uses `defaultUnit`. A leading `-` is fine.
 */
export function parseMeasurement(raw: string, defaultUnit: Unit): number | null {
  const tokens = lex(normalizeFractions(raw))
  if (!tokens || !isPlain(tokens)) return null
  return evaluate(tokens, defaultUnit)
}

/** Result of evaluating a field's text: the value in mm, plus the display unit
 *  it should adopt (only a plain single measurement adopts a typed unit; an
 *  arithmetic expression keeps the box's current unit). */
export interface EvalResult {
  mm: number
  explicitUnit: Unit | null
}

/**
 * Evaluate a measurement field's text: a measurement, or arithmetic on
 * measurements with `+ - * /` (or `× ÷`) and parentheses, usual precedence,
 * spaces optional:
 *
 *   `30+15+2-3`        → 44 (in the box's unit)
 *   `(3 1/2) / 2`      → 1 3/4
 *   `3.5/2`            → 1.75     (a fraction bar needs whole numbers)
 *   `23 3/4 + 1/2 in`  → mixed units, result kept in the box's unit
 *   `5' 3"`            → 63"      (feet and inches side by side add up)
 *   `+3`, `*2`, `/2`   → start from the box's current value
 *   `-3`               → minus three, not "current minus three", so negative
 *                        values can be typed at all
 *
 * A bare number is in the box's unit; a typed unit makes it a length of its
 * own, so `10 + 1 in` in a mm box is 35.4. A length can be scaled by a number
 * (`2 * 3 in`) but not multiplied or divided by another length. Returns null
 * if anything fails to parse, or on a division by zero.
 */
export function evaluateMeasurement(raw: string, currentMm: number, defaultUnit: Unit): EvalResult | null {
  const tokens = lex(normalizeFractions(raw))
  if (!tokens || tokens.length === 0) return null

  // A plain measurement adopts the unit it was typed in.
  if (isPlain(tokens)) {
    const mm = evaluate(tokens, defaultUnit)
    return mm === null ? null : { mm, explicitUnit: detectDisplayUnit(raw) }
  }

  // Leading `+`, `*` or `/`: carry on from what's in the box.
  const first = tokens[0]
  const relative = first.kind === 'op' && first.op !== '-'
  const full: Token[] = relative ? [{ kind: 'num', value: currentMm, mm: true }, ...tokens] : tokens
  const mm = evaluate(full, defaultUnit)
  return mm === null ? null : { mm, explicitUnit: null }
}

/**
 * One piece of a field's text. A number carries its value and whether a unit
 * was typed with it: with one (`3 in`) it's a length, already in mm; without
 * (`3`), a plain number that becomes the box's unit only if it ends up a
 * length. Mixed numbers (`23 3/4`) and fractions (`3/4`) are single numbers.
 */
type Token =
  | { kind: 'num'; value: number; mm: boolean }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'paren'; open: boolean }

const OPERATORS: Record<string, '+' | '-' | '*' | '/'> = {
  '+': '+',
  '-': '-',
  '−': '-',
  '*': '*',
  '×': '*',
  '/': '/',
  '÷': '/',
}

/** Whole or decimal number: `3`, `3.5`, `.5`. */
const NUMBER = /^(\d+(?:\.\d*)?|\.\d+)/
/** A unit right after a number, spaces allowed: `in`, `mm`, `"`, `'`. */
const UNIT = /^\s*([a-z]+|"|')/i

/**
 * Split a field's text into tokens, or null on anything unreadable. The one
 * judgement made here is what a `/` between two numbers means: written tight
 * between two whole numbers (`3/4`) it's a fraction bar; anywhere else
 * (`3.5/2`, `600 / 2`, after a `)`) it divides. `23 3/4` — a whole number, a
 * space, then a fraction — is one mixed number.
 */
function lex(text: string): Token[] | null {
  const tokens: Token[] = []
  let rest = text.trim()

  while (rest.length > 0) {
    const char = rest[0]
    if (/\s/.test(char)) {
      rest = rest.trimStart()
      continue
    }
    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', open: char === '(' })
      rest = rest.slice(1)
      continue
    }
    if (OPERATORS[char]) {
      tokens.push({ kind: 'op', op: OPERATORS[char] })
      rest = rest.slice(1)
      continue
    }

    const number = rest.match(NUMBER)
    if (!number) return null
    let value = parseFloat(number[1])
    rest = rest.slice(number[1].length)
    const whole = /^\d+$/.test(number[1])

    // `3/4`: a fraction bar, tight between whole numbers.
    const fraction = whole ? rest.match(/^\/(\d+)(?![\d.])/) : null
    if (fraction) {
      const den = Number(fraction[1])
      if (den === 0) return null
      value = value / den
      rest = rest.slice(fraction[0].length)
    } else {
      // `23 3/4`: a number, a space, then a fraction.
      const mixed = rest.match(/^\s+(\d+)\/(\d+)(?![\d.])/)
      if (mixed) {
        const den = Number(mixed[2])
        if (den === 0) return null
        value += Number(mixed[1]) / den
        rest = rest.slice(mixed[0].length)
      }
    }

    const unit = rest.match(UNIT)
    if (unit) {
      const perUnit = INPUT_UNIT_MM[unit[1].toLowerCase()]
      if (perUnit === undefined) return null
      tokens.push({ kind: 'num', value: value * perUnit, mm: true })
      rest = rest.slice(unit[0].length)
    } else {
      tokens.push({ kind: 'num', value, mm: false })
    }
  }
  return tokens
}

/** One measurement on its own, maybe negative or in feet and inches — no
 *  arithmetic. */
function isPlain(tokens: Token[]): boolean {
  const body = tokens[0]?.kind === 'op' && tokens[0].op === '-' ? tokens.slice(1) : tokens
  return body.length > 0 && body.every((t) => t.kind === 'num')
}

/** A value while evaluating: a length in mm, or a plain number. */
interface Value {
  value: number
  mm: boolean
}

/**
 * Evaluate tokens by recursive descent — `sum` of `product`s of `factor`s —
 * and turn the result into mm. Null on a syntax error, a division by zero, or
 * a length times / over a length.
 */
function evaluate(tokens: Token[], defaultUnit: Unit): number | null {
  let i = 0
  const peek = () => tokens[i]
  const toMm = (v: Value): number => (v.mm ? v.value : v.value * MM_PER_UNIT[defaultUnit])

  const sum = (): Value | null => {
    let left = product()
    while (left) {
      const t = peek()
      if (t?.kind !== 'op' || (t.op !== '+' && t.op !== '-')) break
      i++
      const right = product()
      if (!right) return null
      const sign = t.op === '+' ? 1 : -1
      // Plain numbers add as plain numbers; once a length is involved, the
      // plain side is in the box's unit.
      left =
        left.mm || right.mm
          ? { value: toMm(left) + sign * toMm(right), mm: true }
          : { value: left.value + sign * right.value, mm: false }
    }
    return left
  }

  const product = (): Value | null => {
    let left = factor()
    while (left) {
      const t = peek()
      if (t?.kind !== 'op' || (t.op !== '*' && t.op !== '/')) break
      i++
      const right = factor()
      // A length scales by a number; a length times a length isn't one.
      if (!right || (left.mm && right.mm)) return null
      if (t.op === '/' && right.value === 0) return null
      left = { value: t.op === '*' ? left.value * right.value : left.value / right.value, mm: left.mm || right.mm }
    }
    return left
  }

  const factor = (): Value | null => {
    const t = peek()
    if (!t) return null
    if (t.kind === 'op' && (t.op === '-' || t.op === '+')) {
      i++
      const inner = factor()
      return inner && { ...inner, value: t.op === '-' ? -inner.value : inner.value }
    }
    if (t.kind === 'paren' && t.open) {
      i++
      const inner = sum()
      const close = peek()
      if (!inner || close?.kind !== 'paren' || close.open) return null
      i++
      return inner
    }
    if (t.kind === 'num') {
      i++
      // Lengths side by side add up: `5' 3"`.
      let value: Value = { value: t.value, mm: t.mm }
      while (value.mm) {
        const next = peek()
        if (next?.kind !== 'num' || !next.mm) break
        value = { value: value.value + next.value, mm: true }
        i++
      }
      return value
    }
    return null
  }

  const result = sum()
  if (!result || i !== tokens.length) return null
  const mm = toMm(result)
  return Number.isFinite(mm) ? mm : null
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
