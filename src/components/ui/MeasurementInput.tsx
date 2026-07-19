import { useEffect, useState } from 'react'
import { evaluateMeasurement, formatMeasurement, UNIT_SUFFIX, type Unit } from '../../lib/units'

interface MeasurementInputProps {
  label: string
  /** The value in millimetres — geometry is always stored in mm. */
  value: number
  /** Reports the committed value and the unit it should now be remembered in
   *  (an explicitly typed unit, else the field's current display unit). */
  onChange: (mm: number, unit: Unit) => void
  /** Document default: the display/entry unit for a field the user hasn't pinned. */
  defaultUnit: Unit
  /** The unit this field was last entered in, if any. Wins over the document
   *  default so a value typed in mm keeps showing mm — never an inch fraction. */
  unit?: Unit
  /** Optional lower bound in mm (dimensions clamp to >= 1; positions don't). */
  min?: number
}

/**
 * A text field for a length that understands units. Type a bare number (read in
 * this field's own unit) or an explicit one like `24.5 in`, `3/4"`, `18mm`.
 *
 * The unit is *sticky per field*: whatever unit you last entered is remembered
 * (persisted on the panel), so a thickness typed in mm always displays in mm and
 * never gets shown — or written back — as an inch approximation. Fields you've
 * never touched follow the document default.
 */
export function MeasurementInput({ label, value, onChange, defaultUnit, unit, min }: MeasurementInputProps) {
  // The field's own unit wins; the document default only fills in when unset.
  const displayUnit = unit ?? defaultUnit
  const [text, setText] = useState(() => formatMeasurement(value, displayUnit))
  const [focused, setFocused] = useState(false)
  // Only an edited field writes back. The shown text can be a lossy fraction
  // (18 mm → 11/16"), so committing an untouched field would corrupt the value.
  const [dirty, setDirty] = useState(false)

  // Reflect external changes (gizmo drag, unit switch, import) unless mid-edit.
  useEffect(() => {
    if (!focused) setText(formatMeasurement(value, displayUnit))
  }, [value, displayUnit, focused])

  const commit = () => {
    // Bare numbers are read in this field's unit; an explicit suffix overrides
    // both the value's unit and what the field is remembered in.
    const result = evaluateMeasurement(text, value, displayUnit)
    if (result === null) {
      setText(formatMeasurement(value, displayUnit)) // reject: restore last good value
      return
    }
    const resolved = result.explicitUnit ?? displayUnit
    const mm = min === undefined ? result.mm : Math.max(min, result.mm)
    onChange(mm, resolved)
    setText(formatMeasurement(mm, resolved))
  }

  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <span className="field__control">
        <input
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setDirty(true)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            if (dirty) commit()
            else setText(formatMeasurement(value, displayUnit)) // untouched: restore canonical display, no write-back
            setDirty(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <span className="field__suffix">{UNIT_SUFFIX[displayUnit]}</span>
      </span>
    </label>
  )
}
