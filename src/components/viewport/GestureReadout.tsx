import { useEffect, useRef } from 'react'
import { evaluateMeasurement, formatMeasurement, UNIT_SUFFIX } from '../../lib/units'
import { useDesignStore } from '../../store/designStore'

/**
 * Corner HUD showing the live delta of the current move/resize gesture, kept
 * out of the main view. While dragging it's a read-only readout that updates
 * every frame; on release it becomes an input so an exact amount can be typed.
 * Enter (or clicking away, which blurs) commits; Escape or Ctrl+Z reverts. Commit/cancel
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
    <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded border border-edge bg-surface/95 px-2.5 py-1.5 shadow-lg shadow-black/40">
      <span className="text-xs tracking-wide text-ink-dim uppercase">
        {gesture.kind === 'move' ? 'Move' : 'Resize'} {gesture.label}
      </span>
      {gesture.editable ? (
        <input
          ref={inputRef}
          type="text"
          className="w-24 rounded border border-accent bg-bg px-1.5 py-0.5 text-right font-mono text-ink focus:outline-none"
          defaultValue={formatMeasurement(gesture.delta, unit)}
          onChange={(e) => {
            // Arithmetic works here too; a relative op (`+3`) applies to the
            // gesture's current delta.
            const result = evaluateMeasurement(e.target.value, gesture.delta, unit)
            if (result) gesture.apply(result.mm)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (
              e.key === 'Escape' ||
              // The gesture isn't committed while this box is open, so the
              // global undo has nothing to undo yet — Ctrl+Z here means "undo
              // the drag I just made", which is exactly a cancel.
              ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z')
            ) {
              e.preventDefault()
              cancel()
            }
          }}
          onBlur={commit}
        />
      ) : (
        <span className="min-w-16 text-right font-mono text-ink tabular-nums">
          {formatMeasurement(gesture.delta, unit)}
        </span>
      )}
      <span className="text-xs text-ink-dim">{UNIT_SUFFIX[unit]}</span>
    </div>
  )
}
