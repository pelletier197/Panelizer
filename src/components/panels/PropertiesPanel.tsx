import { useShallow } from 'zustand/react/shallow'
import type { Axis, Panel } from '../../types/panel'
import { useDesignStore } from '../../store/designStore'
import { MeasurementInput } from '../ui/MeasurementInput'
import { Button } from '../ui/Button'
import { CONTROL, Field, SelectField } from '../ui/Field'
import { Hint, Section } from '../ui/Panel'

const ORIENTATIONS: { value: Axis; label: string }[] = [
  { value: 'x', label: 'Upright side (thickness ← → X)' },
  { value: 'y', label: 'Horizontal shelf (thickness ↑ ↓ Y)' },
  { value: 'z', label: 'Back / door (thickness front-back Z)' },
]

/** Sentinel `<select>` value shown when the selected panels disagree. */
const MIXED = ''

/** A titled block of measurement fields inside the panel editor. */
function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2.5">
      <h4 className="mb-1 text-xs font-semibold tracking-wide text-ink-dim uppercase">{title}</h4>
      {children}
    </div>
  )
}

/** The value every panel agrees on, or undefined when they differ. */
function shared<T>(panels: Panel[], read: (p: Panel) => T): T | undefined {
  const first = read(panels[0])
  return panels.every((p) => read(p) === first) ? first : undefined
}

/** Editor for the selection. A single panel shows every field; several panels
 *  show the fields that make sense in bulk (name, material, orientation, face
 *  size, thickness), with a differing value shown as `Mixed` and an edit applied to
 *  all of them in one undo step. Thickness lives here on purpose — it is the
 *  one dimension the viewport won't let you drag. */
export function PropertiesPanel() {
  const selected = useDesignStore(
    useShallow((s) => s.panels.filter((p) => s.selectedIds.includes(p.id))),
  )
  const materials = useDesignStore((s) => s.materials)
  const unit = useDesignStore((s) => s.unit)
  const precision = useDesignStore((s) => s.precision)
  const updatePanels = useDesignStore((s) => s.updatePanels)
  const removePanels = useDesignStore((s) => s.removePanels)
  const duplicatePanels = useDesignStore((s) => s.duplicatePanels)

  if (selected.length === 0) {
    return (
      <Section title="Panel">
        <Hint>
          Select a panel to edit its dimensions, material, and position. Shift+click or Shift+drag a box
          to select several, Ctrl+A for all.
        </Hint>
      </Section>
    )
  }

  const ids = selected.map((p) => p.id)
  const single = selected.length === 1 ? selected[0] : null
  const update = (patch: Partial<Panel>) => updatePanels(ids, patch)

  const name = shared(selected, (p) => p.name)
  const material = shared(selected, (p) => p.materialId)
  const normal = shared(selected, (p) => p.normal)
  const length = shared(selected, (p) => p.length)
  const width = shared(selected, (p) => p.width)
  const thickness = shared(selected, (p) => p.thickness)

  const measure = (label: string, value: number | undefined, field: 'length' | 'width' | 'thickness') => (
    <MeasurementInput
      label={label}
      value={value ?? selected[0][field]}
      mixed={value === undefined}
      unit={unit}
      precision={precision}
      min={1}
      snap
      onChange={(v) => update({ [field]: v })}
    />
  )

  const setPosition = (panel: Panel, axis: 0 | 1 | 2, value: number) => {
    const position: [number, number, number] = [...panel.position]
    position[axis] = value
    updatePanels([panel.id], { position })
  }

  return (
    <Section
      title={single ? 'Panel' : `${selected.length} panels`}
      action={
        <div className="flex gap-1.5">
          <Button size="sm" title="Duplicate (Ctrl+D)" onClick={() => duplicatePanels(ids)}>
            Duplicate
          </Button>
          <Button size="sm" variant="danger" title="Delete (Del)" onClick={() => removePanels(ids)}>
            Delete
          </Button>
        </div>
      }
    >
      {/* With several panels, typing names them all (e.g. a run of shelves);
          differing names show as a `Mixed` placeholder until then. */}
      <Field label="Name">
        <input
          type="text"
          className={CONTROL}
          value={name ?? ''}
          placeholder={name === undefined ? 'Mixed' : undefined}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>

      <SelectField
        label="Material"
        value={material ?? MIXED}
        onChange={(e) => update({ materialId: e.target.value })}
      >
        {material === undefined && (
          <option value={MIXED} disabled>
            Mixed
          </option>
        )}
        {materials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Orientation"
        value={normal ?? MIXED}
        onChange={(e) => update({ normal: e.target.value as Axis })}
      >
        {normal === undefined && (
          <option value={MIXED} disabled>
            Mixed
          </option>
        )}
        {ORIENTATIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>

      <FieldGroup title="Face">
        {measure('Length', length, 'length')}
        {measure('Width', width, 'width')}
        {measure('Thickness', thickness, 'thickness')}
      </FieldGroup>

      {single ? (
        <FieldGroup title="Position (centre)">
          <MeasurementInput label="X" value={single.position[0]} unit={unit} precision={precision} snap onChange={(v) => setPosition(single, 0, v)} />
          <MeasurementInput label="Y" value={single.position[1]} unit={unit} precision={precision} snap onChange={(v) => setPosition(single, 1, v)} />
          <MeasurementInput label="Z" value={single.position[2]} unit={unit} precision={precision} snap onChange={(v) => setPosition(single, 2, v)} />
        </FieldGroup>
      ) : (
        <Hint>Drag any handle to move or resize them together.</Hint>
      )}
    </Section>
  )
}
