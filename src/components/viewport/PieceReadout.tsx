import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useDesignStore } from '../../store/designStore'
import { unionBounds } from '../../lib/framing'
import { formatMeasurement } from '../../lib/units'
import { AXIS_COLORS } from './palette'

const SIZES = [
  { axis: 0, name: 'Width', letter: 'X' },
  { axis: 1, name: 'Height', letter: 'Y' },
  { axis: 2, name: 'Depth', letter: 'Z' },
] as const

/**
 * A small chip in the viewport's top-right corner with the overall size of the
 * piece — or of the selection, when there is one — as width × height × depth.
 * Pointing at a size names it and draws it on the model in its axis colour.
 */
export function PieceReadout() {
  const unit = useDesignStore((s) => s.unit)
  const setHighlight = useDesignStore((s) => s.setFieldHighlight)
  const selected = useDesignStore(useShallow((s) => s.panels.filter((p) => s.selectedIds.includes(p.id))))
  const panels = useDesignStore((s) => s.panels)
  const [hovered, setHovered] = useState<0 | 1 | 2 | null>(null)

  // Leave no line behind when the chip goes away mid-hover.
  useEffect(() => () => setHighlight('hover', null), [setHighlight])

  if (panels.length === 0) return null
  const bounds = unionBounds(selected.length > 0 ? selected : panels)!
  const hover = (axis: 0 | 1 | 2 | null) => {
    setHovered(axis)
    setHighlight('hover', axis === null ? null : { kind: 'extent', axis })
  }

  return (
    <div className="text-micro absolute top-10 right-3 flex items-baseline gap-2 rounded border border-edge bg-surface/90 px-2.5 py-1.5 shadow-lg shadow-black/30 md:top-3 print:hidden">
      <span className="text-ink-dim">
        {hovered === null ? (selected.length > 0 ? 'Selection' : 'Overall') : `${SIZES[hovered].name} (${SIZES[hovered].letter})`}
      </span>
      <span className="font-medium text-ink tabular-nums">
        {SIZES.map(({ axis, name, letter }, i) => (
          <span key={axis}>
            {i > 0 && <span className="text-ink-faint"> × </span>}
            <span
              className="cursor-default rounded px-0.5"
              style={hovered === axis ? { color: AXIS_COLORS[axis] } : undefined}
              title={`${name} (${letter})`}
              onMouseEnter={() => hover(axis)}
              onMouseLeave={() => hover(null)}
            >
              {formatMeasurement(bounds.max[axis] - bounds.min[axis], unit)}
            </span>
          </span>
        ))}
      </span>
    </div>
  )
}
