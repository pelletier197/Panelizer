import { useEffect, useRef } from 'react'
import { formatMeasurement, parseMeasurement, UNIT_SUFFIX } from '../../lib/units'
import { useDesignStore } from '../../store/designStore'

/**
 * Corner HUD showing the live delta of the current move/resize gesture, kept
 * out of the main view. While dragging it's a read-only readout that updates
 * every frame; on release it becomes an input so an exact amount can be typed.
 * Enter (or clicking away, which blurs) commits; Escape reverts. Commit/cancel
 * fire once — Enter blurs, and the guard stops the double fire.
 */
export function GestureReadout() {
  const gesture = useDesignStore((s) => s.gesture)
  const unit = useDesignStore((s) => s.unit)
  const inputRef = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  const editable = gesture?.editable ?? false
  useEffect(() => {
    if (editable) {
      done.current = false
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editable])

  if (!gesture) return null

  const commit = () => {
    if (done.current) return
    done.current = true
    gesture.commit()
  }
  const cancel = () => {
    if (done.current) return
    done.current = true
    gesture.cancel()
  }

  return (
    <div className="gesture-readout">
      <span className="gesture-readout__label">
        {gesture.kind === 'move' ? 'Move' : 'Resize'} {gesture.label}
      </span>
      {gesture.editable ? (
        <input
          ref={inputRef}
          type="text"
          defaultValue={formatMeasurement(gesture.delta, unit)}
          onChange={(e) => {
            const mm = parseMeasurement(e.target.value, unit)
            if (mm !== null) gesture.apply(mm)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          onBlur={commit}
        />
      ) : (
        <span className="gesture-readout__value">{formatMeasurement(gesture.delta, unit)}</span>
      )}
      <span className="gesture-readout__unit">{UNIT_SUFFIX[unit]}</span>
    </div>
  )
}
