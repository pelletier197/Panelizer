import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { Panel } from '../../types/panel'
import { useDesignStore } from '../../store/designStore'
import { rotatePanels } from '../../lib/rotate'
import { MeasurementInput } from '../ui/MeasurementInput'
import { Button } from '../ui/Button'
import { CONTROL, Field, SelectField } from '../ui/Field'
import { Hint, Section } from '../ui/Panel'
import { Kbd } from '../ui/Kbd'
import { KEYS } from '../ui/keys'

/** Sentinel `<select>` value shown when the selected panels disagree. */
const MIXED = ''

function RotateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v4h-4" />
    </svg>
  )
}

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
 *  show the fields that make sense in bulk (name, material, face size,
 *  thickness), with a differing value shown as `Mixed` and an edit applied to
 *  all of them in one undo step. Orientation is changed by quarter turns about
 *  a world axis rather than picked from a list — a turn is predictable, keeps
 *  the grain on the wood, and works on a whole selection. Thickness lives here
 *  on purpose — it is the one dimension the viewport won't let you drag. */
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
  const rotateSelection = useDesignStore((s) => s.rotateSelection)
  const setRotatePreview = useDesignStore((s) => s.setRotatePreview)
  // Shift flips a rotate button's direction, on click and in its preview.
  const shiftHeld = useDesignStore((s) => s.boxKeyHeld)
  const [hoveredTurn, setHoveredTurn] = useState<0 | 1 | 2 | null>(null)

  // While a rotate button is hovered, ghost the selection where that turn
  // would put it. Recomputed after a click too, so the ghost always shows the
  // *next* turn, and cleared when the pointer leaves or the panel unmounts.
  useEffect(() => {
    if (hoveredTurn === null || selected.length === 0) {
      setRotatePreview([])
      return
    }
    const patches = new Map(rotatePanels(selected, hoveredTurn, shiftHeld ? -1 : 1).map((x) => [x.id, x.patch]))
    setRotatePreview(selected.map((p) => ({ ...p, ...patches.get(p.id) })))
  }, [hoveredTurn, shiftHeld, selected, setRotatePreview])
  useEffect(() => () => setRotatePreview([]), [setRotatePreview])

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
          <Button size="sm" onClick={() => duplicatePanels(ids)}>
            Duplicate
            <Kbd keys={KEYS.duplicate} />
          </Button>
          <Button size="sm" variant="danger" onClick={() => removePanels(ids)}>
            Delete
            <Kbd keys={KEYS.delete} />
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

      {/* Not a <Field>: that wraps its row in a <label>, and a click on the
          label text would press the first button. */}
      <div className="flex items-center gap-2 py-[3px]">
        <span className="text-small w-20 shrink-0 text-ink-dim">Rotate 90°</span>
        <div className="flex flex-1 gap-1" role="group" aria-label="Rotate 90 degrees">
          {(['X', 'Y', 'Z'] as const).map((label, axis) => (
            <Button
              key={label}
              size="sm"
              className="flex-1"
              title={`Turn 90° around ${label} · Shift+click turns the other way`}
              onClick={(e) => rotateSelection(axis as 0 | 1 | 2, e.shiftKey ? -1 : 1)}
              onMouseEnter={() => setHoveredTurn(axis as 0 | 1 | 2)}
              onMouseLeave={() => setHoveredTurn(null)}
            >
              <RotateIcon /> {label}
              {/* R turns around the vertical, so only the Y button has a key. */}
              {label === 'Y' && <Kbd keys={KEYS.rotate} />}
            </Button>
          ))}
        </div>
      </div>

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
