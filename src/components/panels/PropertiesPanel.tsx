import type { Axis } from '../../types/panel'
import { useDesignStore } from '../../store/designStore'
import { MeasurementInput } from '../ui/MeasurementInput'

const ORIENTATIONS: { value: Axis; label: string }[] = [
  { value: 'x', label: 'Upright side (thickness ← → X)' },
  { value: 'y', label: 'Horizontal shelf (thickness ↑ ↓ Y)' },
  { value: 'z', label: 'Back / door (thickness front-back Z)' },
]

/** Editor for the selected panel. Length and width are freely editable; the
 *  face resizes and the thickness stays put. Thickness lives here on purpose —
 *  it is the one dimension the viewport won't let you drag. */
export function PropertiesPanel() {
  const selectedIds = useDesignStore((s) => s.selectedIds)
  // The editor targets a single selection; a multi-selection shows a summary.
  const panel = useDesignStore((s) =>
    s.selectedIds.length === 1 ? (s.panels.find((p) => p.id === s.selectedIds[0]) ?? null) : null,
  )
  const materials = useDesignStore((s) => s.materials)
  const unit = useDesignStore((s) => s.unit)
  const updatePanel = useDesignStore((s) => s.updatePanel)
  const setPanelMaterial = useDesignStore((s) => s.setPanelMaterial)
  const removePanel = useDesignStore((s) => s.removePanel)
  const removePanels = useDesignStore((s) => s.removePanels)
  const duplicatePanel = useDesignStore((s) => s.duplicatePanel)

  if (selectedIds.length > 1) {
    return (
      <section className="sidebar__section properties">
        <div className="sidebar__header">
          <h2>{selectedIds.length} panels</h2>
          <div className="properties__actions">
            <button className="toolbar__danger" onClick={() => removePanels(selectedIds)}>
              Delete
            </button>
          </div>
        </div>
        <p className="properties__hint">
          Drag any handle to move them together. Shift+click a panel to add or remove it.
        </p>
      </section>
    )
  }

  if (!panel) {
    return (
      <section className="sidebar__section properties properties--empty">
        <p>Select a panel to edit its dimensions, material, and position. Shift+click to select several.</p>
      </section>
    )
  }

  const setPosition = (axis: 0 | 1 | 2, value: number) => {
    const position: [number, number, number] = [...panel.position]
    position[axis] = value
    updatePanel(panel.id, { position })
  }

  return (
    <section className="sidebar__section properties">
      <div className="sidebar__header">
        <h2>Panel</h2>
        <div className="properties__actions">
          <button onClick={() => duplicatePanel(panel.id)}>Duplicate</button>
          <button className="toolbar__danger" onClick={() => removePanel(panel.id)}>
            Delete
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field__label">Name</span>
        <span className="field__control">
          <input
            type="text"
            value={panel.name}
            onChange={(e) => updatePanel(panel.id, { name: e.target.value })}
          />
        </span>
      </label>

      <label className="field">
        <span className="field__label">Material</span>
        <span className="field__control">
          <select value={panel.materialId} onChange={(e) => setPanelMaterial(panel.id, e.target.value)}>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </span>
      </label>

      <label className="field">
        <span className="field__label">Orientation</span>
        <span className="field__control">
          <select
            value={panel.normal}
            onChange={(e) => updatePanel(panel.id, { normal: e.target.value as Axis })}
          >
            {ORIENTATIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </span>
      </label>

      <div className="field-group">
        <h3>Face</h3>
        <MeasurementInput label="Length" value={panel.length} defaultUnit={unit} min={1} onChange={(v) => updatePanel(panel.id, { length: v })} />
        <MeasurementInput label="Width" value={panel.width} defaultUnit={unit} min={1} onChange={(v) => updatePanel(panel.id, { width: v })} />
        <MeasurementInput label="Thickness" value={panel.thickness} defaultUnit={unit} min={1} onChange={(v) => updatePanel(panel.id, { thickness: v })} />
      </div>

      <div className="field-group">
        <h3>Position (centre)</h3>
        <MeasurementInput label="X" value={panel.position[0]} defaultUnit={unit} onChange={(v) => setPosition(0, v)} />
        <MeasurementInput label="Y" value={panel.position[1]} defaultUnit={unit} onChange={(v) => setPosition(1, v)} />
        <MeasurementInput label="Z" value={panel.position[2]} defaultUnit={unit} onChange={(v) => setPosition(2, v)} />
      </div>
    </section>
  )
}
