import { useEffect, useState } from 'react'
import {
  evaluateMeasurement,
  formatMeasurement,
  formatMeasurementPlain,
  roundToUnitGrid,
  sameSystem,
  UNIT_SUFFIX,
  type Unit,
} from '../../lib/units'
import { CONTROL_NUMERIC, Field } from './Field'

interface MeasurementInputProps {
  label: string
  /** The value in millimetres — geometry is always stored in mm. */
  value: number
  onChange: (mm: number) => void
  /** The single document unit. Bare numbers are read in it; entry in the other
   *  measuring system is rejected (a mm value can't be typed into an inch doc). */
  unit: Unit
  /** Imperial working precision (fraction denominator) the value snaps to. */
  precision: number
  /** Optional lower bound in mm (dimensions clamp to >= 1; positions don't). */
  min?: number
  /** Snap the committed value onto the working grid so what's shown is exactly
   *  what's stored. On for sizes and typed positions. */
  snap?: boolean
  /** The field edits several panels that disagree: show it empty with a
   *  `Mixed` placeholder, and leave them alone unless something is typed. */
  mixed?: boolean
}

/**
 * Text field for a length in the document's unit. Type a decimal or, in inch,
 * fractions/mixed numbers (`3/4`, `13 1/2`). The document works in ONE unit —
 * entry in the other system is refused, so a value never silently converts to a
 * lossy fraction. Size fields snap to the unit grid on commit (What You See Is
 * What's Stored); only an edited field writes back.
 */
export function MeasurementInput({
  label,
  value,
  onChange,
  unit,
  precision,
  min,
  snap = false,
  mixed = false,
}: MeasurementInputProps) {
  const display = (mm: number) => (mixed ? '' : formatMeasurement(mm, unit))
  const [text, setText] = useState(() => display(value))
  const [focused, setFocused] = useState(false)
  // Only an edited field writes back — the shown text can be a rounded display,
  // so committing an untouched field could shift the stored value.
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!focused) setText(mixed ? '' : formatMeasurement(value, unit))
  }, [value, unit, focused, mixed])

  const commit = () => {
    const result = evaluateMeasurement(text, value, unit)
    // Reject unparseable input, or a unit from the other measuring system.
    if (result === null || (result.explicitUnit && !sameSystem(result.explicitUnit, unit))) {
      setText(display(value))
      return
    }
    let mm = min === undefined ? result.mm : Math.max(min, result.mm)
    if (snap) mm = roundToUnitGrid(mm, unit, precision)
    onChange(mm)
    setText(formatMeasurement(mm, unit))
  }

  return (
    <Field label={label} suffix={UNIT_SUFFIX[unit]}>
      <input
        type="text"
        inputMode="decimal"
        className={CONTROL_NUMERIC}
        value={text}
        placeholder={mixed ? 'Mixed' : undefined}
        onChange={(e) => {
          setText(e.target.value)
          setDirty(true)
        }}
        onFocus={() => {
          setFocused(true)
          // Swap the compact glyph fraction for plain ASCII while editing —
          // a caret can't be moved sensibly through `¹⁄₄`.
          setText(mixed ? '' : formatMeasurementPlain(value, unit))
        }}
        onBlur={() => {
          setFocused(false)
          // A mixed field left blank means "keep each panel's own value".
          if (dirty && !(mixed && text.trim() === '')) commit()
          else setText(display(value))
          setDirty(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </Field>
  )
}
