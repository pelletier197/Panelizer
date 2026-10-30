import type { CutlistResult } from '../../../lib/nesting'
import { partNames, type PartRow } from '../../../lib/parts'
import { formatMeasurement, type Unit } from '../../../lib/units'
import { useDesignStore } from '../../../store/designStore'
import { SheetSvg } from './SheetSvg'
import { sheetKey, type MissingStock } from './useCutlistModel'
import { Button } from '../../ui/Button'
import { Hint, Swatch } from '../../ui/Panel'
import { cx } from '../../ui/cx'

/** Longest sheet drawn this wide (px); everything else scales to match. On
 *  paper the sheets go wider so every part's label + size stays legible. */
const SHEET_MAX_PX = 360
const PRINT_SHEET_MAX_PX = 680

/** The cut diagrams, the notices for anything that didn't nest, and the
 *  print-only parts table. */
export function CutResult({
  result,
  pending,
  parts,
  missing,
  unit,
  margin,
  hovered,
  onHover,
  showTip,
  hideTip,
  printing,
  previewSheets,
}: {
  result: CutlistResult
  /** A newer layout is being worked out; `result` is the previous one. */
  pending: boolean
  /** Only the parts still to cut (already-cut ones are left out). */
  parts: PartRow[]
  missing: MissingStock[]
  unit: Unit
  margin: number
  hovered: string[] | null
  onHover: (ids: string[] | null) => void
  showTip: (e: { clientX: number; clientY: number }, text: string) => void
  hideTip: () => void
  printing: boolean
  /** Sheets an export being pointed at would export, to outline (keys from
   *  `sheetKey`). The first is scrolled into view. */
  previewSheets: string[] | null
}) {
  const updatePanels = useDesignStore((s) => s.updatePanels)
  const fmt = (mm: number) => formatMeasurement(mm, unit)

  const tooBig = result.unplaced.filter((u) => u.reason === 'too-big')
  const grainLocked = result.unplaced.filter((u) => u.reason === 'grain-locked')
  const noSpace = result.unplaced.filter((u) => u.reason === 'no-space')

  return (
    <main
      className={cx('min-w-0 flex-1 overflow-y-auto p-4 transition-opacity', pending && 'opacity-60')}
      aria-busy={pending}
    >
      {pending && (
        <p className="text-micro mt-0 mb-2 text-ink-dim print:hidden" role="status">
          Laying out sheets…
        </p>
      )}

      {!pending && result.groups.length === 0 && result.unplaced.length === 0 && (
        <Hint>Add sheet goods on the left to lay out the cut.</Hint>
      )}

      {result.groups.map((group) => {
        // Sheets in a group can differ in size; waste is over their actual
        // areas, and all are drawn to one scale (the group's biggest sheet) so
        // relative sizes read true.
        const sheetArea = group.sheets.reduce((sum, s) => sum + s.length * s.width, 0)
        const used = group.sheets.reduce((sum, s) => sum + s.usedArea, 0)
        const waste = sheetArea ? Math.round((1 - used / sheetArea) * 100) : 0
        const maxLength = Math.max(...group.sheets.map((s) => s.length))
        const scale = (printing ? PRINT_SHEET_MAX_PX : SHEET_MAX_PX) / maxLength

        return (
          <section data-cut-group className="mb-6" key={group.key}>
            <h3 className="mt-0 mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <Swatch color={group.color} /> {group.materialName} · {fmt(group.thickness)}
              <span className="ml-2 text-xs font-normal text-ink-dim">
                {group.sheets.length} sheet{group.sheets.length === 1 ? '' : 's'} · {waste}% waste
              </span>
            </h3>
            <div className="flex flex-wrap gap-4">
              {group.sheets.map((sheet) => (
                <SheetSvg
                  key={sheet.index}
                  sheet={sheet}
                  scale={scale}
                  margin={margin}
                  color={group.color}
                  unit={unit}
                  hovered={hovered}
                  onHover={onHover}
                  showTip={showTip}
                  hideTip={hideTip}
                  printing={printing}
                  previewed={previewSheets?.includes(sheetKey(group.key, sheet.index)) ?? false}
                  reveal={previewSheets?.[0] === sheetKey(group.key, sheet.index)}
                />
              ))}
            </div>
          </section>
        )
      })}

      <MissingStockNotice missing={missing} unit={unit} />

      {tooBig.length > 0 && (
        <section className="mb-6 rounded border border-danger/40 bg-danger/10 p-3">
          <h3 className="mt-0 mb-1 text-sm font-semibold text-danger">Too big for the sheet</h3>
          <ul className="m-0 list-disc pl-5 text-sm text-ink-dim">
            {tooBig.map((u) => (
              <li key={u.panelId}>
                {u.name} — larger than the {u.materialName} · {fmt(u.thickness)} sheet (minus margin)
              </li>
            ))}
          </ul>
        </section>
      )}

      {grainLocked.length > 0 && (
        <section className="mb-6 rounded border border-danger/40 bg-danger/10 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="m-0 text-sm font-semibold text-danger">Fits only if turned</h3>
            <Button size="sm" onClick={() => updatePanels(grainLocked.map((u) => u.panelId), { grain: 'none' })}>
              Allow turning
            </Button>
          </div>
          <Hint>
            These parts would fit the sheet turned 90°, but their grain direction forbids it. Allow turning
            if the grain doesn't matter for them, or add a bigger sheet:
          </Hint>
          <ul className="m-0 list-disc pl-5 text-sm text-ink-dim">
            {grainLocked.map((u) => (
              <li key={u.panelId}>
                {u.name} — {u.materialName} · {fmt(u.thickness)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {noSpace.length > 0 && (
        <section className="mb-6 rounded border border-danger/40 bg-danger/10 p-3">
          <h3 className="mt-0 mb-1 text-sm font-semibold text-danger">Not enough stock</h3>
          <Hint>
            These parts fit, but the available sheet quantity ran out — raise a quantity or add more sheets:
          </Hint>
          <ul className="m-0 list-disc pl-5 text-sm text-ink-dim">
            {noSpace.map((u) => (
              <li key={u.panelId}>
                {u.name} — {u.materialName} · {fmt(u.thickness)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Print-only parts table: every part to cut, with its dimensions, so the
          printout carries the full list next to the diagrams. */}
      <section data-print-list className="hidden print:block">
        <h3 className="mt-0 mb-1 text-sm font-semibold">Parts</h3>
        <table>
          <thead>
            <tr>
              <th>Qty</th>
              <th>Part</th>
              <th>Length × Width</th>
              <th>Thickness</th>
              <th>Material</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((row, i) => (
              <tr key={i}>
                <td>{row.quantity}×</td>
                <td>{partNames(row.parts)}</td>
                <td>
                  {fmt(row.length)} × {fmt(row.width)}
                </td>
                <td>{fmt(row.thickness)}</td>
                <td>{row.material}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}

/** Parts with no matching stock at all, with a one-click fix. */
function MissingStockNotice({ missing, unit }: { missing: MissingStock[]; unit: Unit }) {
  const materials = useDesignStore((s) => s.materials)
  const addStock = useDesignStore((s) => s.addStock)

  if (missing.length === 0) return null

  return (
    <section className="mb-6 rounded border border-snap-middle/40 bg-snap-middle/10 p-3">
      <h3 className="mt-0 mb-1 text-sm font-semibold text-snap-middle">Missing stock</h3>
      <Hint>These parts have no sheet to nest onto. Add the matching stock:</Hint>
      {missing.map((m) => (
        <div className="flex items-center justify-between gap-2 py-1 text-sm" key={`${m.materialId}@${m.thickness}`}>
          <span>
            <Swatch color={materials.find((x) => x.id === m.materialId)?.color} />{' '}
            {m.materialName} · {formatMeasurement(m.thickness, unit)} — {m.count} part{m.count === 1 ? '' : 's'}
          </span>
          <Button size="sm" onClick={() => addStock(m.materialId, m.thickness)}>+ Add sheet</Button>
        </div>
      ))}
    </section>
  )
}
