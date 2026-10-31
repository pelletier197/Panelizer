import { useState, type ReactNode } from 'react'
import { formatMeasurement } from '../../lib/units'
import { useDesignStore } from '../../store/designStore'
import { cx } from '../ui/cx'

/**
 * The sidebar on a phone: a sheet along the bottom, under the 3D view rather
 * than over it, so the model always has the rest of the screen. Closed, it is
 * one bar saying what is selected (or what the design holds); tap it to pull
 * the panel editor and parts list up over half the screen.
 */
export function MobileDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const summary = useDesignStore((s) => {
    const selected = s.panels.filter((p) => s.selectedIds.includes(p.id))
    const fmt = (mm: number) => formatMeasurement(mm, s.unit)
    if (selected.length === 1) {
      const [p] = selected
      return `${p.name} · ${fmt(p.length)} × ${fmt(p.width)} × ${fmt(p.thickness)}`
    }
    if (selected.length > 1) return `${selected.length} panels selected`
    return `${s.panels.length} panel${s.panels.length === 1 ? '' : 's'}`
  })

  return (
    <aside
      className={cx(
        'flex shrink-0 flex-col border-t border-edge bg-surface',
        open && 'h-[55dvh]',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full cursor-pointer flex-col items-center gap-1.5 border-0 bg-transparent px-4 pt-2 pb-2.5 text-ink"
        onClick={() => setOpen((o) => !o)}
      >
        {/* The grab bar people expect on a bottom sheet. */}
        <span className="h-1 w-10 rounded-full bg-edge-strong" />
        <span className="flex w-full items-center justify-between gap-3 text-sm">
          <span className="truncate font-medium">{summary}</span>
          <span className="shrink-0 text-xs text-ink-dim">{open ? 'Hide ▾' : 'Details ▴'}</span>
        </span>
      </button>
      {open && <div className="min-h-0 flex-1 overflow-y-auto border-t border-edge">{children}</div>}
    </aside>
  )
}
