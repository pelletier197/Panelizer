import { useEffect, useRef, useState } from 'react'
import {
  evaluateMeasurement,
  formatMeasurement,
  gridStepMm,
  formatMeasurementPlain,
  roundToUnitGrid,
  sameSystem,
  UNIT_SUFFIX,
  type Unit,
} from '../../lib/units'
import { CONTROL_NUMERIC, Field } from './Field'
import { cx } from './cx'

interface MeasurementInputProps {
  /** Usually text; a small icon works too (give it a `description`). */
  label: React.ReactNode
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
  /** Label above the field instead of beside it, and no unit suffix — for
   *  fields laid out several to a row, whose group names the unit once. */
  stacked?: boolean
  /**
   * Arrow-key stepping, for callers that can preview a change live. ↑ / ↓ step
   * the value by one precision increment (Shift: ten). While a key is held
   * the field reports the running delta from where it started as `live`; on
   * release it reports the final delta as `commit` — one change, however many
   * steps — and Escape mid-hold reports `cancel`. Without this the arrows still
   * step the text, and the value is written once on release.
   */
  onNudge?: (deltaMm: number, phase: 'live' | 'commit' | 'cancel') => void
  /** The field's accessible name and tooltip, when the visible label is only a
   *  symbol (a corner mark). Defaults to the label. */
  description?: string
  /** Extra classes for a stacked label — e.g. to show a symbol label larger. */
  labelClassName?: string
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
  stacked = false,
  onNudge,
  description,
  labelClassName,
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

  // The running arrow-key delta while a ↑ / ↓ is held, and the value it
  // started from (the stored value moves underneath during a live preview).
  const nudge = useRef<{ start: number; delta: number } | null>(null)

  const step = (direction: 1 | -1, big: boolean) => {
    const start = nudge.current?.start ?? value
    const increment = gridStepMm(unit, precision) * (big ? 10 : 1)
    let delta = (nudge.current?.delta ?? 0) + direction * increment
    // Don't step below the field's minimum.
    if (min !== undefined && start + delta < min) delta = min - start
    nudge.current = { start, delta }
    if (!mixed) setText(formatMeasurementPlain(start + delta, unit))
    onNudge?.(delta, 'live')
  }

  // Release (or leaving the field mid-hold) ends the run as a single change.
  const endNudge = (phase: 'commit' | 'cancel') => {
    const run = nudge.current
    if (!run) return
    nudge.current = null
    if (onNudge) {
      onNudge(phase === 'commit' ? run.delta : 0, phase)
    } else if (phase === 'commit' && run.delta !== 0) {
      let mm = run.start + run.delta
      if (snap) mm = roundToUnitGrid(mm, unit, precision)
      onChange(mm)
    }
    setDirty(false)
    if (phase === 'cancel') setText(mixed ? '' : formatMeasurementPlain(run.start, unit))
  }

  const input = (
    <input
      type="text"
      inputMode="decimal"
      className={CONTROL_NUMERIC}
      value={text}
      placeholder={mixed ? 'Mixed' : undefined}
      aria-label={description}
      title={description}
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
        if (nudge.current) {
          endNudge('commit')
          setText(display(value))
          return
        }
        // A mixed field left blank means "keep each panel's own value".
        if (dirty && !(mixed && text.trim() === '')) commit()
        else setText(display(value))
        setDirty(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault() // keep the caret where it is
          step(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey)
        } else if (e.key === 'Escape' && nudge.current) {
          e.preventDefault()
          endNudge('cancel')
        } else if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') endNudge('commit')
      }}
    />
  )

  if (stacked) {
    return (
      <label className="group flex min-w-0 flex-col gap-0.5">
        <span className={cx('text-micro truncate text-ink-dim group-focus-within:text-ink', labelClassName)}>{label}</span>
        {input}
      </label>
    )
  }

  return (
    <Field label={label} suffix={UNIT_SUFFIX[unit]}>
      {input}
    </Field>
  )
}
