import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { defaultGrain, type Grain, type Panel } from '../../types/panel'
import { isAutoGrain } from '../../lib/panel'
import { useDesignStore, type FieldHighlight } from '../../store/designStore'
import { roundToUnitGrid, UNIT_SUFFIX } from '../../lib/units'
import { rotatePanels } from '../../lib/rotate'
import { axisField } from '../../lib/geometry'
import { CORNER_SIGNS } from '../../lib/rounding'
import { MeasurementInput } from '../ui/MeasurementInput'
import { Button } from '../ui/Button'
import { CONTROL, Field, SelectField } from '../ui/Field'
import { Hint, Section } from '../ui/Panel'
import { Kbd } from '../ui/Kbd'
import { cx } from '../ui/cx'
import { KEYS } from '../ui/keys'
import { useTouch } from '../../hooks/useMedia'

type CornerIndex = 0 | 1 | 2 | 3

/** World direction names for each axis: [the − side, the + side]. */
const SIDE_NAMES = [
  ['left', 'right'],
  ['bottom', 'top'],
  ['back', 'front'],
] as const

/**
 * The label of a corner field: a small square with the corner in question
 * rounded and drawn in the text colour, the rest faint — so the label shows
 * which corner it is. `position` is the field's place in the layout: 0 top /
 * far left, 1 top / far right, 2 bottom / near left, 3 bottom / near right.
 */
function CornerIcon({ position }: { position: 0 | 1 | 2 | 3 }) {
  // The rounded corner's arc, from one edge to the other, in a 12×12 box.
  const arcs = ['M1 7 V5 A4 4 0 0 1 5 1 H7', 'M5 1 H7 A4 4 0 0 1 11 5 V7', 'M1 5 V7 A4 4 0 0 0 5 11 H7', 'M5 11 H7 A4 4 0 0 0 11 7 V5']
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" strokeLinecap="round" aria-hidden className="my-px">
      <rect x="1" y="1" width="10" height="10" className="stroke-current opacity-30" strokeWidth="1" />
      <path d={arcs[position]} className="stroke-current" strokeWidth="1.6" />
    </svg>
  )
}

/**
 * The corner fields in the order they're laid out — one row, read like two
 * rows of two (far / top pair, then near / bottom pair) — each a corner index
 * (see lib/rounding), its place in the layout (for the label icon), and a name for where it
 * actually is: "Back left" on a shelf, "Top front" on an upright side, "Top
 * left" on a back. The name is the field's tooltip and accessible name. With
 * no single orientation (a mixed selection), the names fall back to the face's
 * own frame.
 */
function cornerLayout(
  normal: Panel['normal'] | undefined,
): { index: CornerIndex; position: 0 | 1 | 2 | 3; name: string }[] {
  if (!normal) {
    return ([3, 2, 0, 1] as CornerIndex[]).map((index, i) => ({
      index,
      position: i as 0 | 1 | 2 | 3,
      name: ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'][i] + ' corner of the face',
    }))
  }
  const axisOf = (field: 'length' | 'width') => ([0, 1, 2] as const).find((a) => axisField(normal, a) === field)!
  const u = axisOf('length')
  const v = axisOf('width')
  // Name the up/down axis first, then front/back, then left/right: "Top
  // left", "Back right", "Top front".
  const [first, second] = [u, v].sort((a, b) => [1, 2, 0].indexOf(a) - [1, 2, 0].indexOf(b))
  const name = (index: CornerIndex) => {
    const sign = (axis: number) => (CORNER_SIGNS[index][axis === u ? 0 : 1] > 0 ? 1 : 0)
    const words = `${SIDE_NAMES[first][sign(first)]} ${SIDE_NAMES[second][sign(second)]}`
    return words[0].toUpperCase() + words.slice(1)
  }
  // Rows: top (+Y) or back (−Z) first. Columns: −u then +u.
  const farSign = v === 2 ? -1 : 1
  const rows = [farSign, -farSign]
  return rows
    .flatMap((vSign) => [-1, 1].map((uSign) => CORNER_SIGNS.findIndex(([su, sv]) => su === uSign && sv === vSign)))
    .map((index, i) => ({
      index: index as CornerIndex,
      position: i as 0 | 1 | 2 | 3,
      name: `${name(index as CornerIndex)} corner`,
    }))
}

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

/** A titled row of three measurement fields inside the panel editor —
 *  length / width / thickness, or X / Y / Z. One row instead of three keeps the
 *  editor short; the unit is named once in the heading rather than after every
 *  field. */
function FieldGroup({
  title,
  unit,
  cols = 3,
  children,
}: {
  title: string
  unit: string
  cols?: 3 | 4
  children: React.ReactNode
}) {
  // A clear gap above each group, so Face / Corners / Position read as
  // separate blocks rather than one wall of fields.
  return (
    <div className="mt-4">
      <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-ink-dim uppercase">
        {title} <span className="font-normal tracking-normal text-ink-faint normal-case">· {unit}</span>
      </h4>
      <div className={cx('grid gap-1.5', cols === 4 ? 'grid-cols-4' : 'grid-cols-3')}>{children}</div>
    </div>
  )
}

/**
 * Wraps a size or position field so that pointing at it, or typing in it,
 * lights up in the viewport what it changes (see viewport/FieldHighlight).
 * Hover and focus are reported separately — the hovered field wins — and both
 * are cleared when the field goes away.
 */
function HighlightZone({ target, children }: { target: FieldHighlight; children: React.ReactNode }) {
  const setHighlight = useDesignStore((s) => s.setFieldHighlight)
  useEffect(
    () => () => {
      setHighlight('hover', null)
      setHighlight('focus', null)
    },
    [setHighlight],
  )
  return (
    <div
      className="min-w-0"
      onMouseEnter={() => setHighlight('hover', target)}
      onMouseLeave={() => setHighlight('hover', null)}
      onFocus={() => setHighlight('focus', target)}
      onBlur={() => setHighlight('focus', null)}
    >
      {children}
    </div>
  )
}

/** The value every panel agrees on, or undefined when they differ. */
/** How a panel's grain is chosen: automatically (the long edge, following
 *  resizes), or by hand along an edge, or none. */
type GrainMode = 'auto' | Grain

const GRAIN_MODES: { mode: GrainMode; label: string; title: string }[] = [
  { mode: 'auto', label: 'Auto', title: 'Along the longer edge, following it as the panel is resized' },
  { mode: 'length', label: 'Length', title: "Along the panel's length, whatever its size" },
  { mode: 'width', label: 'Width', title: "Along the panel's width, whatever its size" },
  { mode: 'none', label: 'Any', title: 'No grain to keep: the cutlist may turn the part to fit (and wood shows along its length)' },
]

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
  const touch = useTouch()
  const unit = useDesignStore((s) => s.unit)
  const precision = useDesignStore((s) => s.precision)
  const updatePanels = useDesignStore((s) => s.updatePanels)
  const removePanels = useDesignStore((s) => s.removePanels)
  const duplicatePanels = useDesignStore((s) => s.duplicatePanels)
  const rotateSelection = useDesignStore((s) => s.rotateSelection)
  const patchPanelsLive = useDesignStore((s) => s.patchPanelsLive)
  const commitPanelPatches = useDesignStore((s) => s.commitPanelPatches)
  const restorePanels = useDesignStore((s) => s.restorePanels)
  // Each selected panel's value when an arrow-key run started, so every step
  // applies to where it began (the stored value moves underneath live).
  const nudgeStart = useRef<Map<string, number> | null>(null)
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
          {touch
            ? 'Tap a panel in the model to see its size, material, and position.'
            : 'Select a panel to edit its dimensions, material, and position. Shift+click or Shift+drag a box to select several, Ctrl+A for all.'}
        </Hint>
      </Section>
    )
  }

  const ids = selected.map((p) => p.id)
  const single = selected.length === 1 ? selected[0] : null
  const update = (patch: Partial<Panel>) => updatePanels(ids, patch)

  const name = shared(selected, (p) => p.name)
  const material = shared(selected, (p) => p.materialId)
  // Automatic grain shows as Auto; any other, as the edge it runs along.
  const grainMode = shared(selected, (p): GrainMode => (isAutoGrain(p) ? 'auto' : p.grain))
  const setGrainMode = (mode: GrainMode) =>
    mode === 'auto'
      ? // Back to automatic: each panel's grain to its own long edge.
        commitPanelPatches(
          selected.map((p) => ({ id: p.id, patch: { grain: defaultGrain(p.length, p.width), grainSet: undefined } })),
        )
      : update({ grain: mode, grainSet: true })
  const length = shared(selected, (p) => p.length)
  const width = shared(selected, (p) => p.width)
  const thickness = shared(selected, (p) => p.thickness)

  /**
   * Arrow-key stepping for a field, over the whole selection: each panel moves
   * from its own starting value (so a Mixed field steps every panel, rather
   * than forcing one value), live while the key is held, then commits as one
   * undo step. Cancel puts the starting values back without touching history.
   */
  const nudger =
    (read: (p: Panel) => number, write: (p: Panel, v: number) => Partial<Panel>, min?: number) =>
    (delta: number, phase: 'live' | 'commit' | 'cancel') => {
      // Read the selection from the store at key time, not from the last
      // render, so a run that starts right after another edit starts from it.
      const st = useDesignStore.getState()
      const selected = st.panels.filter((p) => st.selectedIds.includes(p.id))
      const starts = (nudgeStart.current ??= new Map(selected.map((p) => [p.id, read(p)])))
      const at = (p: Panel, d: number) => {
        const v = roundToUnitGrid((starts.get(p.id) ?? read(p)) + d, unit, precision)
        return min === undefined ? v : Math.max(min, v)
      }
      if (phase === 'live') {
        patchPanelsLive(selected.map((p) => ({ id: p.id, patch: write(p, at(p, delta)) })))
        return
      }
      if (phase === 'commit' && delta !== 0) {
        commitPanelPatches(selected.map((p) => ({ id: p.id, patch: write(p, at(p, delta)) })))
      } else {
        restorePanels(selected.map((p) => ({ id: p.id, patch: write(p, starts.get(p.id) ?? read(p)) })))
      }
      nudgeStart.current = null
    }

  const measure = (label: string, value: number | undefined, field: 'length' | 'width' | 'thickness') => (
    <HighlightZone target={{ kind: 'size', field }}>
      <MeasurementInput
        label={label}
        value={value ?? selected[0][field]}
        mixed={value === undefined}
        unit={unit}
        precision={precision}
        min={1}
        snap
        stacked
        onChange={(v) => update({ [field]: v })}
        onNudge={nudger((p) => p[field], (_, v) => ({ [field]: v }), 1)}
      />
    </HighlightZone>
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

      {/* Grain: how the cutlist may lay the part on the sheet, and the way a
          wood finish is drawn on it. Not a <Field>, for the reason below. */}
      <div className="flex items-center gap-2 py-[3px]">
        <span className="text-small w-20 shrink-0 text-ink-dim">Grain</span>
        <div className="flex flex-1 gap-1" role="group" aria-label="Grain direction">
          {GRAIN_MODES.map(({ mode, label, title }) => (
            <Button
              key={mode}
              size="sm"
              className="flex-1"
              variant={grainMode === mode ? 'primary' : 'default'}
              aria-pressed={grainMode === mode}
              title={title}
              onClick={() => setGrainMode(mode)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

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

      <FieldGroup title="Face" unit={UNIT_SUFFIX[unit]}>
        {measure('Length', length, 'length')}
        {measure('Width', width, 'width')}
        {measure('Thickness', thickness, 'thickness')}
      </FieldGroup>

      {/* Named for where each corner is (see cornerLayout); hovering one also
          lights it up in the viewport. */}
      <FieldGroup title="Rounded corners" unit={UNIT_SUFFIX[unit]} cols={4}>
        {cornerLayout(shared(selected, (p) => p.normal)).map(({ index, position, name }) => {
          const radius = shared(selected, (p) => p.corners?.[index] ?? 0)
          const setCorner = (p: Panel, v: number): Partial<Panel> => {
            const corners: [number, number, number, number] = [...(p.corners ?? [0, 0, 0, 0])]
            corners[index] = v
            return { corners }
          }
          return (
            <HighlightZone key={index} target={{ kind: 'corner', index }}>
              <MeasurementInput
                label={<CornerIcon position={position} />}
                description={name}
                value={radius ?? selected[0].corners?.[index] ?? 0}
                mixed={radius === undefined}
                unit={unit}
                precision={precision}
                min={0}
                snap
                stacked
                // Each panel keeps its other corners; only this one changes.
                onChange={(v) => commitPanelPatches(selected.map((p) => ({ id: p.id, patch: setCorner(p, v) })))}
                onNudge={nudger((p) => p.corners?.[index] ?? 0, setCorner, 0)}
              />
            </HighlightZone>
          )
        })}
      </FieldGroup>

      {single ? (
        <FieldGroup title="Position (centre)" unit={UNIT_SUFFIX[unit]}>
          {(['X', 'Y', 'Z'] as const).map((label, i) => {
            const axis = i as 0 | 1 | 2
            return (
              <HighlightZone key={label} target={{ kind: 'position', axis }}>
                <MeasurementInput
                  label={label}
                  value={single.position[axis]}
                  unit={unit}
                  precision={precision}
                  snap
                  stacked
                  onChange={(v) => setPosition(single, axis, v)}
                  onNudge={nudger(
                    (p) => p.position[axis],
                    (p, v) => {
                      const position: [number, number, number] = [...p.position]
                      position[axis] = v
                      return { position }
                    },
                  )}
                />
              </HighlightZone>
            )
          })}
        </FieldGroup>
      ) : (
        <Hint>Drag any handle to move or resize them together.</Hint>
      )}
    </Section>
  )
}
