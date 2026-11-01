import { useEffect, useMemo, useState } from 'react'
import type { Panel } from '../../types/panel'
import { buildParts, partsToCsv } from '../../lib/parts'
import { formatMeasurement, UNIT_SUFFIX, type Unit } from '../../lib/units'
import { useDesignStore } from '../../store/designStore'
import { useTooltip } from '../ui/useTooltip'
import { Button } from '../ui/Button'
import { Hint, Section, Swatch } from '../ui/Panel'
import { PartNames } from '../ui/PartNames'
import { cx } from '../ui/cx'
import { treeChild, treeGroup } from '../ui/tree'
import { TreeBranch } from '../ui/TreeBranch'
import { plural } from '../../lib/plural'

type PartRow = ReturnType<typeof buildParts>[number]

/** Stable identity for a group row, so expand state survives re-derivation. */
const groupKey = (r: PartRow) => `${r.length}x${r.width}x${r.thickness}@${r.material}`

const NUM = 'px-1.5 py-1.5 text-right tabular-nums'
const TXT = 'px-1.5 py-1.5 text-left'

/** Live list of the project's parts, derived from the panels. Identical parts
 *  are grouped and counted; a group can be expanded to reach each panel on its
 *  own, and every panel (or a whole group) can be hidden — ghosted in the
 *  viewport, but still counted here and for snapping. The CSV button copies the
 *  same table for a spreadsheet or the shop. */
export function PartsPanel() {
  const panels = useDesignStore((s) => s.panels)
  const materials = useDesignStore((s) => s.materials)
  const unit = useDesignStore((s) => s.unit)
  const selectedIds = useDesignStore((s) => s.selectedIds)
  const selectInBox = useDesignStore((s) => s.selectInBox)
  const setHidden = useDesignStore((s) => s.setHidden)
  const precision = useDesignStore((s) => s.precision)
  const rows = useMemo(() => buildParts(panels, materials, unit, precision), [panels, materials, unit, precision])
  const byId = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels])

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // A row can disappear under the pointer (deleted, list collapsed): drop
  // any hover highlight with it.
  const setHoverIds = useDesignStore((s) => s.setHoverIds)
  useEffect(() => () => setHoverIds([]), [setHoverIds])

  const copyCsv = () => navigator.clipboard.writeText(partsToCsv(rows, unit))

  // Clicking a row selects its panels — the whole group at once, ready for a
  // batch edit. Shift+click adds them to the selection, or takes them out if
  // they're all already in it (the same toggle as Shift+click in the viewport).
  // Hidden panels are skipped, as everywhere else.
  const pick = (ids: string[], e: React.MouseEvent) => {
    if (!e.shiftKey) return selectInBox(ids, 'replace')
    const allIn = ids.every((id) => selectedIds.includes(id))
    selectInBox(ids, allIn ? 'remove' : 'add')
  }

  return (
    <Section
      title="Parts"
      action={
        <Button size="sm" onClick={copyCsv} disabled={rows.length === 0}>
          Copy CSV
        </Button>
      }
    >
      {rows.length === 0 ? (
        <Hint>No panels yet.</Hint>
      ) : (
        // Fixed layout: a long part name must eat into its own column and
        // truncate, never squeeze the measurements into a multi-line wrap.
        <table className="w-full table-fixed border-collapse text-[13px]">
          <colgroup>
            <col className="w-7" />
            <col className="w-5" />
            <col className="w-8" />
            <col />
            <col className="w-[6.5rem]" />
            <col className="w-14" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="label-micro border-b border-edge-strong">
              {/* Visibility leads: it's the control you reach for while reading
                  down the list, so it gets the leftmost, easiest column. */}
              <th />
              <th />
              <th className={NUM}>Qty</th>
              <th className={TXT}>Part</th>
              {/* Length and width share a column: eight columns will not fit a
                  sidebar, and the pair reads as one measurement anyway. The CSV
                  export still carries them separately. */}
              <th className={NUM}>Size</th>
              <th className={NUM}>Thick.</th>
              <th className={TXT}>Material</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = groupKey(r)
              const open = expanded.has(key)
              const allHidden = r.ids.every((id) => byId.get(id)?.hidden)
              return (
                <GroupRow
                  key={key}
                  row={r}
                  unit={unit}
                  open={open}
                  allHidden={allHidden}
                  selected={r.ids.some((id) => selectedIds.includes(id))}
                  onToggleOpen={() => toggleExpanded(key)}
                  onSelect={(e) => pick(r.ids, e)}
                  onToggleHidden={() => setHidden(r.ids, !allHidden)}
                >
                  {open &&
                    r.ids.map((id, i) => {
                      const child = byId.get(id)
                      if (!child) return null
                      return (
                        <ChildRow
                          key={id}
                          panel={child}
                          name={r.parts[i]}
                          index={i}
                          last={i === r.ids.length - 1}
                          selected={selectedIds.includes(id)}
                          onSelect={(e) => pick([id], e)}
                          onToggleHidden={() => setHidden([id], !child.hidden)}
                        />
                      )
                    })}
                </GroupRow>
              )
            })}
          </tbody>
        </table>
      )}

      <p className="text-micro mt-2 mb-0 text-ink-faint">
        {plural(panels.length, 'panel')} · {plural(rows.length, 'unique part')} · dimensions in {UNIT_SUFFIX[unit]}
      </p>
    </Section>
  )
}

/** A chevron that points right when closed and down when open. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx('transition-transform duration-100', open && 'rotate-90')}
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

/** A grouped parts row: visibility eye, expand chevron (multi-part groups
 *  only), the shared dimensions. Clicking the row selects all of its panels.
 *  Its expanded child rows are passed in as `children` so they sit
 *  directly beneath it in the table body. */
function GroupRow({
  row,
  unit,
  open,
  allHidden,
  selected,
  onToggleOpen,
  onSelect,
  onToggleHidden,
  children,
}: {
  row: PartRow
  unit: Unit
  open: boolean
  allHidden: boolean
  selected: boolean
  onToggleOpen: () => void
  onSelect: (e: React.MouseEvent) => void
  onToggleHidden: () => void
  children?: React.ReactNode
}) {
  const fmt = (mm: number) => formatMeasurement(mm, unit)
  const setHoverIds = useDesignStore((s) => s.setHoverIds)
  const expandable = row.quantity > 1
  const tip = useTooltip(
    expandable
      ? 'Click to select all of them · Shift+click to add · ▸ lists them one by one'
      : 'Click to select · Shift+click to add',
  )

  return (
    <>
      <tr
        // An open group reads as a header for the rows it owns (see ui/tree).
        className={cx('cursor-pointer', treeGroup({ open, highlighted: selected }))}
        onClick={onSelect}
        // Pointer (not mouse) events: the tooltip already owns this row's
        // mouseenter / mouseleave.
        onPointerEnter={() => setHoverIds(row.ids)}
        onPointerLeave={() => setHoverIds([])}
        {...tip.trigger}
      >
        <td className="pl-1">
          <EyeButton
            hidden={allHidden}
            onToggle={onToggleHidden}
            label={allHidden ? 'Show all in group' : 'Hide all in group'}
          />
        </td>
        <td>
          {expandable && (
            <button
              type="button"
              className="flex cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0.5 text-ink-dim hover:bg-surface-3 hover:text-ink"
              onClick={(e) => {
                e.stopPropagation()
                onToggleOpen()
              }}
              aria-label={open ? 'Collapse group' : 'Expand group'}
              aria-expanded={open}
            >
              <Chevron open={open} />
            </button>
          )}
        </td>
        <td className={cx(NUM, 'text-ink-dim')}>{row.quantity}</td>
        <td className={cx(TXT, 'overflow-hidden py-1.5 font-medium text-ink')}>
          <PartNames names={row.parts} />
        </td>
        <td className={cx(NUM, 'whitespace-nowrap')}>
          {fmt(row.length)} × {fmt(row.width)}
        </td>
        <td className={NUM}>{fmt(row.thickness)}</td>
        <td className={cx(TXT, 'overflow-hidden')}>
          <span className="flex items-center gap-1.5">
            <Swatch color={row.color} />
            <span className="truncate text-ink-dim">{row.material}</span>
          </span>
          {tip.node}
        </td>
      </tr>
      {children}
    </>
  )
}

/** One panel inside an expanded group: its own name, selectable and hideable
 *  independently of its siblings. Sits on a recessed surface behind a left rail
 *  so it clearly belongs to the group above it. */
function ChildRow({
  panel,
  name,
  index,
  last,
  selected,
  onSelect,
  onToggleHidden,
}: {
  panel: Panel
  name: string
  index: number
  last: boolean
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onToggleHidden: () => void
}) {
  const setHoverIds = useDesignStore((s) => s.setHoverIds)
  return (
    <tr
      className={cx('cursor-pointer', treeChild({ last, highlighted: selected }), panel.hidden && 'text-ink-faint')}
      onClick={onSelect}
      onPointerEnter={() => setHoverIds([panel.id])}
      onPointerLeave={() => setHoverIds([])}
    >
      <td className="pl-1">
        <EyeButton
          hidden={panel.hidden === true}
          onToggle={onToggleHidden}
          label={panel.hidden ? 'Show panel' : 'Hide panel'}
        />
      </td>
      <td />
      <td className={cx(NUM, 'text-ink-faint')}>{index + 1}</td>
      <td className={cx(TXT, 'overflow-hidden py-1')} colSpan={3}>
        <span className="flex min-w-0 items-center">
          <TreeBranch />
          <span className="truncate">{name}</span>
        </span>
      </td>
      <td />
    </tr>
  )
}

/** Small open/closed-eye toggle. Stops propagation so it never triggers the
 *  row's select. */
function EyeButton({ hidden, onToggle, label }: { hidden: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      className={cx(
        'flex cursor-pointer items-center justify-center rounded border-0 bg-transparent p-1 transition-colors',
        // A hidden panel's eye is amber, so hidden parts stand out down the list
        // instead of fading into the dimmed row.
        hidden ? 'text-snap-middle hover:bg-surface-3' : 'text-ink-dim hover:bg-surface-3 hover:text-ink',
      )}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      aria-label={label}
      title={label}
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"
        />
        <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        {hidden && <path stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M4 20 20 4" />}
      </svg>
    </button>
  )
}
