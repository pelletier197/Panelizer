import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Grain } from '../../../types/panel'
import { formatMeasurement, type Unit } from '../../../lib/units'
import { useDesignStore } from '../../../store/designStore'
import { GrainThumb } from './GrainThumb'
import { nextGrain } from './grainCycle'
import { Section, Swatch } from '../../ui/Panel'
import { PartNames } from '../../ui/PartNames'
import { cx } from '../../ui/cx'
import { treeChild, treeGroup } from '../../ui/tree'
import { TreeBranch } from '../../ui/TreeBranch'
import type { GrainGroup } from './useCutlistModel'

/** How much of a size-group is in the cutlist. */
type Inclusion = 'all' | 'none' | 'some'

/**
 * Per-part grain editing, grouped by material + thickness (the way stock is
 * keyed), then by size within that.
 *
 * A size-group row acts on all its parts at once, which is what you want most
 * of the time. Expanding it reaches each panel individually — the same
 * arrangement as the parts list — so one shelf out of six can be turned or
 * marked already-cut without disturbing its twins. When the parts under a row
 * disagree, the row says so rather than reporting whichever one happens to be
 * first.
 */
export function GrainEditor({
  groups,
  unit,
  hovered,
  onHover,
  unplacedNote,
  tipProps,
}: {
  groups: GrainGroup[]
  unit: Unit
  hovered: string[] | null
  onHover: (ids: string[] | null) => void
  unplacedNote: (ids: string[]) => string | null
  tipProps: (text: string) => object
}) {
  const panels = useDesignStore((s) => s.panels)
  const updatePanel = useDesignStore((s) => s.updatePanel)
  const updatePanels = useDesignStore((s) => s.updatePanels)
  const byId = useMemo(() => new Map(panels.map((p) => [p.id, p])), [panels])
  const fmt = (mm: number) => formatMeasurement(mm, unit)

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const isHovered = (ids: string[]) => hovered !== null && ids.some((id) => hovered.includes(id))
  const grainOfPanel = (id: string): Grain => byId.get(id)?.grain ?? 'length'
  const isIncluded = (id: string) => !byId.get(id)?.excludeFromCutlist

  const inclusionOf = (ids: string[]): Inclusion => {
    const included = ids.filter(isIncluded).length
    if (included === ids.length) return 'all'
    return included === 0 ? 'none' : 'some'
  }

  /** The group's shared grain, or null when its parts disagree. */
  const sharedGrain = (ids: string[]): Grain | null => {
    const first = grainOfPanel(ids[0])
    return ids.every((id) => grainOfPanel(id) === first) ? first : null
  }

  const setGrain = (ids: string[], grain: Grain) =>
    updatePanels(ids, { grain, grainSet: true })

  const cycleGroupGrain = (ids: string[]) => {
    const shared = sharedGrain(ids)
    // From a mixed row the first click matches everything up to the first
    // part's grain; advancing straight away would skip a state you can't see.
    setGrain(ids, shared === null ? grainOfPanel(ids[0]) : nextGrain(shared))
  }

  const setIncluded = (ids: string[], included: boolean) =>
    updatePanels(ids, { excludeFromCutlist: !included })

  return (
    <Section title="Grain">
      {groups.map((group) => (
        <div className="mb-4 last:mb-0" key={`${group.material}@${group.thickness}`}>
          {/* Stock heading: the same "header for the rows it owns" treatment the
              parts list gives an expanded group. */}
          <div className="flex items-center gap-1.5 rounded-t border-b border-edge-strong bg-surface-2 px-2 py-1.5">
            <Swatch color={group.color} />
            <span className="min-w-0 truncate text-[13px] font-medium text-ink">{group.material}</span>
            <span className="text-small shrink-0 text-ink-dim tabular-nums">· {fmt(group.thickness)}</span>
          </div>

          {/* Fixed layout: a long part name must eat into its own column and
              truncate, never squeeze the dimensions into a three-line wrap. */}
          <table className="w-full table-fixed border-collapse text-[13px]">
            <colgroup>
              <col className="w-7" />
              <col className="w-5" />
              <col />
              <col className="w-9" />
              <col className="w-[6.5rem]" />
              <col className="w-12" />
            </colgroup>
            <tbody>
              {group.rows.map((row) => {
                const key = `${group.material}@${group.thickness}|${row.length}x${row.width}`
                const open = expanded.has(key)
                const inclusion = inclusionOf(row.ids)
                const shared = sharedGrain(row.ids)
                const note = unplacedNote(row.ids)
                // Use a real panel's length/width — PartRow dims are normalised
                // longest-first, which would flip the thumb.
                const panel = byId.get(row.ids[0])

                return (
                  <Fragment key={key}>
                    <tr
                      className={cx(
                        treeGroup({ open, highlighted: isHovered(row.ids) }),
                        // An excluded part stays legible — dimmed, not struck
                        // through, so its size can still be read.
                        inclusion === 'none' && 'text-ink-faint',
                      )}
                      onMouseEnter={() => onHover(row.ids)}
                      onMouseLeave={() => onHover(null)}
                    >
                      <td className="pl-1.5 align-middle">
                        <IncludeCheckbox
                          state={inclusion}
                          onChange={() => setIncluded(row.ids, inclusion !== 'all')}
                          tipProps={tipProps}
                        />
                      </td>
                      <td className="align-middle">
                        {row.quantity > 1 && (
                          <button
                            type="button"
                            className="flex cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0.5 text-ink-dim hover:bg-surface-3 hover:text-ink"
                            onClick={() => toggleExpanded(key)}
                            aria-label={open ? 'Collapse parts' : 'Expand parts'}
                            aria-expanded={open}
                          >
                            <Chevron open={open} />
                          </button>
                        )}
                      </td>
                      <td className={cx('overflow-hidden py-2 pr-1', inclusion !== 'none' && 'text-ink', open && 'font-medium')}>
                        <span className="flex min-w-0 items-center gap-1">
                          <PartNames names={row.parts} />
                          {note && (
                            <span className="shrink-0 cursor-help text-snap-middle" {...tipProps(note)}>
                              ⚠
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 text-right text-ink-dim tabular-nums">{row.quantity}×</td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap text-ink-dim tabular-nums">
                        {fmt(row.length)} × {fmt(row.width)}
                      </td>
                      <td className="py-1 pl-1.5">
                        <GrainThumb
                          length={panel?.length ?? row.length}
                          width={panel?.width ?? row.width}
                          grain={shared ?? grainOfPanel(row.ids[0])}
                          mixed={shared === null}
                          onClick={() => cycleGroupGrain(row.ids)}
                          tipProps={tipProps}
                        />
                      </td>
                    </tr>

                    {open &&
                      row.ids.map((id, i) => {
                        const child = byId.get(id)
                        if (!child) return null
                        const childNote = unplacedNote([id])
                        const included = isIncluded(id)

                        return (
                          <tr
                            key={id}
                            className={cx(
                              treeChild({ last: i === row.ids.length - 1, highlighted: isHovered([id]) }),
                              !included && 'text-ink-faint',
                            )}
                            onMouseEnter={() => onHover([id])}
                            onMouseLeave={() => onHover(null)}
                          >
                            <td className="pl-1.5 align-middle">
                              <IncludeCheckbox
                                state={included ? 'all' : 'none'}
                                onChange={() => setIncluded([id], !included)}
                                tipProps={tipProps}
                              />
                            </td>
                            <td />
                            <td className="overflow-hidden py-1.5 pr-1" colSpan={3}>
                              <span className="flex min-w-0 items-center gap-1">
                                <TreeBranch />
                                <span className="truncate">{row.parts[i]}</span>
                                {childNote && (
                                  <span className="shrink-0 cursor-help text-snap-middle" {...tipProps(childNote)}>
                                    ⚠
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-1 pl-1.5">
                              <GrainThumb
                                length={child.length}
                                width={child.width}
                                grain={child.grain}
                                onClick={() => updatePanel(id, { grain: nextGrain(child.grain), grainSet: true })}
                                tipProps={tipProps}
                              />
                            </td>
                          </tr>
                        )
                      })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
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

/** Include-in-cutlist toggle. Goes indeterminate when only some of the parts
 *  under a row are included — `indeterminate` is a DOM property with no HTML
 *  attribute, so it has to be set through a ref. */
function IncludeCheckbox({
  state,
  onChange,
  tipProps,
}: {
  state: Inclusion
  onChange: () => void
  tipProps: (text: string) => object
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])

  const label =
    state === 'all'
      ? 'In cutlist — uncheck if already cut'
      : state === 'none'
        ? 'Excluded — check to add back'
        : 'Some parts excluded — check to include all'

  return (
    <input
      ref={ref}
      type="checkbox"
      // `block` takes it out of the text baseline, which is what left it
      // sitting low in the row.
      className="block size-3.5 cursor-pointer accent-accent"
      checked={state === 'all'}
      onChange={onChange}
      aria-label={label}
      {...tipProps(label)}
    />
  )
}
