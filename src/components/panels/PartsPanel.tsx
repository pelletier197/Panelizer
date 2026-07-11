import { useMemo } from 'react'
import { buildParts, partsToCsv } from '../../lib/parts'
import { formatMeasurement, UNIT_SUFFIX } from '../../lib/units'
import { useDesignStore } from '../../store/designStore'

/** Live list of the project's parts, derived from the panels. Identical parts
 *  are grouped and counted, and every dimension is shown in the document's
 *  unit; the CSV button copies the same table for a spreadsheet or the shop. */
export function PartsPanel() {
  const panels = useDesignStore((s) => s.panels)
  const materials = useDesignStore((s) => s.materials)
  const unit = useDesignStore((s) => s.unit)
  const selectedIds = useDesignStore((s) => s.selectedIds)
  const select = useDesignStore((s) => s.select)
  const rows = useMemo(() => buildParts(panels, materials), [panels, materials])

  const copyCsv = () => navigator.clipboard.writeText(partsToCsv(rows, unit))
  const fmt = (mm: number) => formatMeasurement(mm, unit)

  // Clicking a row selects (and so highlights) its panel. For a multi-part row
  // each click steps to the next part, so identical panels can all be found.
  const selectRow = (ids: string[]) => {
    const at = ids.findIndex((id) => selectedIds.includes(id))
    select(ids[(at + 1) % ids.length])
  }

  return (
    <section className="sidebar__section parts">
      <div className="sidebar__header">
        <h2>Parts</h2>
        <button onClick={copyCsv} disabled={rows.length === 0}>
          Copy CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="parts__empty">No panels yet.</p>
      ) : (
        <table className="parts__table">
          <thead>
            <tr>
              <th>Qty</th>
              <th>Length</th>
              <th>Width</th>
              <th>Thick.</th>
              <th>Material</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={r.ids.some((id) => selectedIds.includes(id)) ? 'is-selected' : ''}
                onClick={() => selectRow(r.ids)}
                title={r.quantity > 1 ? 'Click to cycle through matching panels' : 'Click to select'}
              >
                <td>{r.quantity}</td>
                <td>{fmt(r.length)}</td>
                <td>{fmt(r.width)}</td>
                <td>{fmt(r.thickness)}</td>
                <td>
                  <span className="parts__swatch" style={{ background: r.color }} /> {r.material}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="parts__total">
        {panels.length} panel{panels.length === 1 ? '' : 's'} · {rows.length} unique part
        {rows.length === 1 ? '' : 's'} · dimensions in {UNIT_SUFFIX[unit]}
      </p>
    </section>
  )
}
