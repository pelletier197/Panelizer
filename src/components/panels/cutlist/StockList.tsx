import { useRef, useState } from 'react'
import type { Stock } from '../../../lib/stock'
import { formatMeasurement, type Unit } from '../../../lib/units'
import { useDesignStore } from '../../../store/designStore'
import { MeasurementInput } from '../../ui/MeasurementInput'
import { Button } from '../../ui/Button'
import { CONTROL, Field } from '../../ui/Field'
import { Hint, Section, Swatch } from '../../ui/Panel'
import { CheckIcon, PencilIcon } from './icons'

/**
 * Kerf/margin settings plus the sheet-goods inventory. Each stock row collapses
 * to a one-line summary unless it's the one being edited — a fresh sheet always
 * needs sizing, so adding one drops straight into edit mode.
 */
export function StockList({ unit, precision }: { unit: Unit; precision: number }) {
  const materials = useDesignStore((s) => s.materials)
  const stocks = useDesignStore((s) => s.stocks)
  const kerf = useDesignStore((s) => s.kerf)
  const margin = useDesignStore((s) => s.margin)
  const setKerf = useDesignStore((s) => s.setKerf)
  const setMargin = useDesignStore((s) => s.setMargin)
  const addStock = useDesignStore((s) => s.addStock)
  const updateStock = useDesignStore((s) => s.updateStock)
  const removeStock = useDesignStore((s) => s.removeStock)

  const [editing, setEditing] = useState<string | null>(null)

  const addAndEdit = () => {
    addStock(materials[0].id)
    const created = useDesignStore.getState().stocks.at(-1)
    if (created) setEditing(created.id)
  }

  return (
    <>
      <Section title="Settings">
        {/* Not snapped to the working grid: blades and trims come in sizes
            like 2.6 mm that a 1 mm (or 1/16") grid would round away. */}
        <MeasurementInput label="Kerf" value={kerf} unit={unit} precision={precision} min={0} onChange={setKerf} />
        <MeasurementInput label="Margin" value={margin} unit={unit} precision={precision} min={0} onChange={setMargin} />
      </Section>

      <Section
        title="Sheet goods"
        action={
          <Button size="sm" onClick={addAndEdit}>
            + Add
          </Button>
        }
      >
        {stocks.length === 0 && (
          <Hint>Add the sheets you have — parts nest onto stock of the same material and thickness.</Hint>
        )}

        {stocks.map((stock) =>
          editing === stock.id ? (
            <StockEditor
              key={stock.id}
              stock={stock}
              unit={unit}
              precision={precision}
              onChange={(patch) => updateStock(stock.id, patch)}
              onDone={() => setEditing(null)}
            />
          ) : (
            <StockSummary
              key={stock.id}
              stock={stock}
              unit={unit}
              onEdit={() => setEditing(stock.id)}
              onRemove={() => removeStock(stock.id)}
            />
          ),
        )}
      </Section>
    </>
  )
}

function StockEditor({
  stock,
  unit,
  precision,
  onChange,
  onDone,
}: {
  stock: Stock
  unit: Unit
  precision: number
  onChange: (patch: Partial<Stock>) => void
  onDone: () => void
}) {
  const materials = useDesignStore((s) => s.materials)

  // Edits apply live — the nesting preview on the right re-runs as you type, so
  // there is nothing "pending" to throw away. Cancel therefore means *restore*:
  // snapshot the row as it was when editing began and write it back.
  const original = useRef(stock)

  return (
    <div className="mb-1.5 rounded border border-edge bg-surface-2 p-2">
      <select
        className={CONTROL}
        value={stock.materialId}
        onChange={(e) => onChange({ materialId: e.target.value })}
      >
        {materials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <div className="mt-1 grid grid-cols-2 gap-x-2">
        <MeasurementInput label="Thickness" value={stock.thickness} unit={unit} precision={precision} min={1} snap onChange={(v) => onChange({ thickness: v })} />
        <Field label="Quantity">
          <input
            type="number"
            min={1}
            placeholder="∞"
            className={CONTROL}
            value={stock.quantity ?? ''}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              onChange({ quantity: Number.isFinite(n) && n > 0 ? n : null })
            }}
          />
        </Field>
        <MeasurementInput label="Length" value={stock.length} unit={unit} precision={precision} min={1} snap onChange={(v) => onChange({ length: v })} />
        <MeasurementInput label="Width" value={stock.width} unit={unit} precision={precision} min={1} snap onChange={(v) => onChange({ width: v })} />
      </div>

      {/* Deleting the sheet lives on the collapsed row, so this pair is only
          ever "keep" or "put it back". */}
      <div className="mt-2.5 flex items-center justify-end gap-2 border-t border-edge pt-2">
        <Button
          size="sm"
          onClick={() => {
            onChange(original.current)
            onDone()
          }}
        >
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={onDone}>
          <CheckIcon />
          Done
        </Button>
      </div>
    </div>
  )
}

function StockSummary({
  stock,
  unit,
  onEdit,
  onRemove,
}: {
  stock: Stock
  unit: Unit
  onEdit: () => void
  onRemove: () => void
}) {
  const material = useDesignStore((s) => s.materials.find((m) => m.id === stock.materialId))
  const fmt = (mm: number) => formatMeasurement(mm, unit)

  return (
    // Same row treatment as the parts and grain tables: separators, hover, and
    // every number tabular so sheet sizes line up down the list.
    <div className="group flex items-center gap-1.5 border-b border-edge/60 py-1 text-[13px] transition-colors last:border-b-0 hover:bg-surface-2">
      <Swatch color={material?.color} />
      <span className="min-w-0 flex-1 truncate text-ink">{material?.name}</span>
      <span className="shrink-0 text-ink-dim tabular-nums">{fmt(stock.thickness)}</span>
      <span className="text-small shrink-0 text-ink-faint tabular-nums">
        {fmt(stock.length)} × {fmt(stock.width)}
      </span>
      {/* Quantity reads as a chip so "∞" and "3×" don't get lost in the run of
          dimensions. */}
      <span className="text-micro shrink-0 rounded-full bg-surface-3 px-1.5 py-px text-ink-dim tabular-nums">
        {stock.quantity ? `${stock.quantity}×` : '∞'}
      </span>
      {/* Actions stay quiet until the row is hovered or focused. */}
      <span className="ml-1 flex shrink-0 gap-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Button variant="ghost" icon aria-label="Edit stock" onClick={onEdit}>
          <PencilIcon />
        </Button>
        <Button variant="dangerGhost" icon aria-label="Remove stock" onClick={onRemove}>
          ✕
        </Button>
      </span>
    </div>
  )
}
