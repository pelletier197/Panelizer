import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Grain } from '../../types/panel'
import { generateCutlist, type SheetLayout } from '../../lib/nesting'
import { buildParts, partNames, type PartRow } from '../../lib/parts'
import { formatMeasurement } from '../../lib/units'
import { useDesignStore } from '../../store/designStore'
import { MeasurementInput } from '../ui/MeasurementInput'

/** Click order for the grain toggle: width → length → free → (loops back). */
const GRAIN_CYCLE: Grain[] = ['width', 'length', 'none']
const nextGrain = (g: Grain): Grain => GRAIN_CYCLE[(GRAIN_CYCLE.indexOf(g) + 1) % GRAIN_CYCLE.length]

const GRAIN_LABEL: Record<Grain, string> = {
  width: 'Grain along width',
  length: 'Grain along length',
  none: 'Free orientation',
}

/** Longest sheet drawn this wide (px); everything else scales to match. On
 *  paper the sheets go wider so every part's label + size stays legible. */
const SHEET_MAX_PX = 360
const PRINT_SHEET_MAX_PX = 680

/** Controls-panel width bounds + persisted UI preference. */
const CONTROLS_MIN = 240
const CONTROLS_MAX = 640
const CONTROLS_KEY = 'panelizer.ui.cutlistControls'
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

function loadControlsWidth(): number {
  try {
    const raw = Number(localStorage.getItem(CONTROLS_KEY))
    if (raw >= CONTROLS_MIN && raw <= CONTROLS_MAX) return raw
  } catch {
    // ignore unavailable storage
  }
  return 320
}

/**
 * Full-screen cutlist view. You set the global kerf and margin, enter the
 * sheet goods you have, and it nests the project's parts onto those sheets —
 * grouped by material + thickness — showing a cut diagram and the waste per
 * material. Grain per part is edited here too (defaults to the longer edge).
 */
export function CutlistModal() {
  const open = useDesignStore((s) => s.cutlistOpen)
  const setOpen = useDesignStore((s) => s.setCutlistOpen)
  const panels = useDesignStore((s) => s.panels)
  const materials = useDesignStore((s) => s.materials)
  const stocks = useDesignStore((s) => s.stocks)
  const unit = useDesignStore((s) => s.unit)
  const kerf = useDesignStore((s) => s.kerf)
  const margin = useDesignStore((s) => s.margin)
  const setKerf = useDesignStore((s) => s.setKerf)
  const setMargin = useDesignStore((s) => s.setMargin)
  const addStock = useDesignStore((s) => s.addStock)
  const updateStock = useDesignStore((s) => s.updateStock)
  const removeStock = useDesignStore((s) => s.removeStock)
  const updatePanel = useDesignStore((s) => s.updatePanel)

  // Parts flagged "already cut" are dropped before nesting, but still listed in
  // the grain editor (dimmed) so they can be re-enabled.
  const result = useMemo(
    () => generateCutlist(panels.filter((p) => !p.excludeFromCutlist), materials, stocks, kerf, margin),
    [panels, materials, stocks, kerf, margin],
  )
  const parts = useMemo(() => buildParts(panels, materials), [panels, materials])
  const grainOf = (ids: string[]) => panels.find((p) => p.id === ids[0])?.grain ?? 'length'
  const cycleGrain = (ids: string[]) => {
    const next = nextGrain(grainOf(ids))
    ids.forEach((id) => updatePanel(id, { grain: next }))
  }
  // Add a sheet and drop straight into editing it (a fresh sheet needs sizing).
  const addAndEdit = () => {
    addStock(materials[0].id)
    const created = useDesignStore.getState().stocks.at(-1)
    if (created) setEditingStock(created.id)
  }
  const includedOf = (ids: string[]) => !panels.find((p) => p.id === ids[0])?.excludeFromCutlist
  const toggleIncluded = (ids: string[]) => {
    const exclude = includedOf(ids) // currently included → exclude it
    ids.forEach((id) => updatePanel(id, { excludeFromCutlist: exclude }))
  }

  // Grain is edited per material + thickness, since that's how stock is keyed —
  // one heading per sheet type, its parts listed by name underneath.
  const grainGroups = useMemo(() => {
    const map = new Map<string, { material: string; thickness: number; color: string; rows: PartRow[] }>()
    for (const r of parts) {
      const key = `${r.material}@${r.thickness}`
      const g = map.get(key)
      if (g) g.rows.push(r)
      else map.set(key, { material: r.material, thickness: r.thickness, color: r.color, rows: [r] })
    }
    return [...map.values()]
  }, [parts])

  const asideRef = useRef<HTMLElement>(null)
  const [controlsWidth, setControlsWidth] = useState(loadControlsWidth)
  // Panels currently hovered — shared between the grain list and the cut
  // diagrams so hovering either side highlights the matching parts.
  const [hovered, setHovered] = useState<string[] | null>(null)
  // Instant custom tooltip for a hovered cut piece (native <title> is slow).
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  // Sheet-good row being edited; others collapse to a one-line summary.
  const [editingStock, setEditingStock] = useState<string | null>(null)
  // While printing, diagrams render every label + size, bigger and monochrome.
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    // flushSync so the print-mode DOM is in place before the browser snapshots.
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(CONTROLS_KEY, String(controlsWidth))
    } catch {
      // best-effort
    }
  }, [controlsWidth])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  // Drag the handle on the controls' right edge to resize it; width persists.
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const left = asideRef.current?.getBoundingClientRect().left ?? 0
    const onMove = (ev: MouseEvent) => setControlsWidth(clamp(ev.clientX - left, CONTROLS_MIN, CONTROLS_MAX))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!open) return null

  const fmt = (mm: number) => formatMeasurement(mm, unit)
  const isHovered = (ids: string[]) => hovered !== null && ids.some((id) => hovered.includes(id))
  // Which panels didn't make it onto a sheet, and why — surfaced as a cue in
  // the grain list so a part with no stock / too big is easy to spot.
  const unplacedReason = new Map(result.unplaced.map((u) => [u.panelId, u.reason]))
  const unplacedNote = (ids: string[]): string | null => {
    const id = ids.find((x) => unplacedReason.has(x))
    if (!id) return null
    const reason = unplacedReason.get(id)
    if (reason === 'too-big') return 'Too big for the sheet'
    if (reason === 'no-space') return 'Not enough stock to fit it'
    return 'No matching stock'
  }

  // Parts that couldn't be placed only because their material + thickness has
  // no stock yet — grouped so we can offer a one-click "add the right sheet".
  const missing = [
    ...result.unplaced
      .filter((u) => u.reason === 'no-stock')
      .reduce((map, u) => {
        const key = `${u.materialId}@${u.thickness}`
        const e = map.get(key)
        if (e) e.count += 1
        else map.set(key, { materialId: u.materialId, materialName: u.materialName, thickness: u.thickness, count: 1 })
        return map
      }, new Map<string, { materialId: string; materialName: string; thickness: number; count: number }>())
      .values(),
  ]
  const tooBig = result.unplaced.filter((u) => u.reason === 'too-big')
  const noSpace = result.unplaced.filter((u) => u.reason === 'no-space')

  return (
    <div className="cutlist-overlay" onClick={() => setOpen(false)}>
      <div className="cutlist-view" onClick={(e) => e.stopPropagation()}>
        <header className="cutlist-view__header">
          <h2>Cutlist</h2>
          <button className="cutlist-view__print" onClick={() => window.print()}>
            Print
          </button>
          <button className="cutlist-view__close" aria-label="Close" onClick={() => setOpen(false)}>
            ✕
          </button>
        </header>

        <div className="cutlist-view__body">
          <aside className="cutlist-view__controls" ref={asideRef} style={{ width: controlsWidth }}>
            <div className="field-group">
              <h3>Settings</h3>
              <MeasurementInput label="Kerf" value={kerf} defaultUnit={unit} min={0} onChange={setKerf} />
              <MeasurementInput label="Margin" value={margin} defaultUnit={unit} min={0} onChange={setMargin} />
            </div>

            <div className="field-group">
              <div className="sidebar__header">
                <h3>Sheet goods</h3>
                <button onClick={addAndEdit}>+ Add</button>
              </div>
              {stocks.length === 0 && (
                <p className="cutlist-view__hint">Add the sheets you have — parts nest onto stock of the same material and thickness.</p>
              )}
              {stocks.map((s) => {
                const mat = materials.find((m) => m.id === s.materialId)
                return editingStock === s.id ? (
                  <div className="stock stock--editing" key={s.id}>
                    <div className="stock__row">
                      <select value={s.materialId} onChange={(e) => updateStock(s.id, { materialId: e.target.value })}>
                        {materials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="stock__grid">
                      <MeasurementInput label="Thickness" value={s.thickness} defaultUnit={unit} min={1} onChange={(v) => updateStock(s.id, { thickness: v })} />
                      <label className="field">
                        <span className="field__label">Quantity</span>
                        <span className="field__control">
                          <input
                            type="number"
                            min={1}
                            placeholder="∞"
                            value={s.quantity ?? ''}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10)
                              updateStock(s.id, { quantity: Number.isFinite(n) && n > 0 ? n : null })
                            }}
                          />
                        </span>
                      </label>
                      <MeasurementInput label="Length" value={s.length} defaultUnit={unit} min={1} onChange={(v) => updateStock(s.id, { length: v })} />
                      <MeasurementInput label="Width" value={s.width} defaultUnit={unit} min={1} onChange={(v) => updateStock(s.id, { width: v })} />
                    </div>
                    <div className="stock__actions">
                      <button className="material__remove" aria-label="Remove stock" onClick={() => removeStock(s.id)}>
                        ✕
                      </button>
                      <button className="stock__done" aria-label="Done editing" onClick={() => setEditingStock(null)}>
                        <CheckIcon />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="stock stock__summary" key={s.id}>
                    <span className="parts__swatch" style={{ background: mat?.color }} />
                    <span className="stock__name">{mat?.name} · {fmt(s.thickness)}</span>
                    <span className="stock__dims">
                      {fmt(s.length)} × {fmt(s.width)} · {s.quantity ? `${s.quantity}×` : '∞'}
                    </span>
                    <button className="stock__edit" aria-label="Edit stock" onClick={() => setEditingStock(s.id)}>
                      <PencilIcon />
                    </button>
                    <button className="material__remove" aria-label="Remove stock" onClick={() => removeStock(s.id)}>
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="field-group">
              <h3>Grain</h3>
              {grainGroups.map((group) => (
                <div className="grain-group" key={`${group.material}@${group.thickness}`}>
                  <div className="grain-group__head">
                    <span className="parts__swatch" style={{ background: group.color }} /> {group.material} · {fmt(group.thickness)}
                  </div>
                  <table className="parts__table grain-group__table">
                    <tbody>
                      {group.rows.map((r, i) => {
                        const note = unplacedNote(r.ids)
                        // Use the real panel's length/width (PartRow dims are
                        // normalised longest-first, which would flip the thumb).
                        const panel = panels.find((p) => p.id === r.ids[0])
                        const included = includedOf(r.ids)
                        return (
                          <tr
                            key={i}
                            className={`${isHovered(r.ids) ? 'is-hover' : ''}${included ? '' : ' is-excluded'}`}
                            onMouseEnter={() => setHovered(r.ids)}
                            onMouseLeave={() => setHovered(null)}
                          >
                            <td>
                              <input
                                type="checkbox"
                                className="grain-include"
                                checked={included}
                                onChange={() => toggleIncluded(r.ids)}
                                aria-label={included ? 'Exclude from cutlist (already cut)' : 'Include in cutlist'}
                                onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, text: included ? 'In cutlist — uncheck if already cut' : 'Excluded — check to add back' })}
                                onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, text: included ? 'In cutlist — uncheck if already cut' : 'Excluded — check to add back' })}
                                onMouseLeave={() => setTip(null)}
                              />
                            </td>
                            <td className="parts__name">
                              {partNames(r.parts)}
                              {note && (
                                <span
                                  className="grain-warn"
                                  onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, text: note })}
                                  onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, text: note })}
                                  onMouseLeave={() => setTip(null)}
                                >
                                  ⚠
                                </span>
                              )}
                            </td>
                            <td>{r.quantity}×</td>
                            <td>
                              {fmt(r.length)} × {fmt(r.width)}
                            </td>
                            <td>
                              <GrainThumb
                                length={panel?.length ?? r.length}
                                width={panel?.width ?? r.width}
                                grain={panel?.grain ?? 'length'}
                                onClick={() => cycleGrain(r.ids)}
                                onTip={setTip}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </aside>

          <div
            className="cutlist-resizer"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startResize}
          />

          <main className="cutlist-view__result">
            {result.groups.length === 0 && result.unplaced.length === 0 && (
              <p className="cutlist-view__hint">Add sheet goods on the left to lay out the cut.</p>
            )}

            {result.groups.map((g) => {
              // Sheets in a group can differ in size; waste is over their actual
              // areas, and all are drawn to one scale (the group's biggest sheet)
              // so relative sizes read true.
              const sheetAreaSum = g.sheets.reduce((sum, s) => sum + s.length * s.width, 0)
              const used = g.sheets.reduce((sum, s) => sum + s.usedArea, 0)
              const waste = sheetAreaSum ? Math.round((1 - used / sheetAreaSum) * 100) : 0
              const maxLength = Math.max(...g.sheets.map((s) => s.length))
              const scale = (printing ? PRINT_SHEET_MAX_PX : SHEET_MAX_PX) / maxLength
              return (
                <section className="cut-group" key={g.key}>
                  <h3>
                    <span className="parts__swatch" style={{ background: g.color }} /> {g.materialName} · {fmt(g.thickness)}
                    <span className="cut-group__stats">
                      {g.sheets.length} sheet{g.sheets.length === 1 ? '' : 's'} · {waste}% waste
                    </span>
                  </h3>
                  <div className="cut-group__sheets">
                    {g.sheets.map((s) => (
                      <SheetSvg
                        key={s.index}
                        sheet={s}
                        scale={scale}
                        margin={margin}
                        color={g.color}
                        unit={unit}
                        hovered={hovered}
                        onHover={setHovered}
                        onTip={setTip}
                        printing={printing}
                      />
                    ))}
                  </div>
                </section>
              )
            })}

            {missing.length > 0 && (
              <section className="cut-group cut-group--missing">
                <h3>Missing stock</h3>
                <p className="cutlist-view__hint">
                  These parts have no sheet to nest onto. Add the matching stock:
                </p>
                {missing.map((m) => (
                  <div className="missing-row" key={`${m.materialId}@${m.thickness}`}>
                    <span>
                      <span className="parts__swatch" style={{ background: materials.find((x) => x.id === m.materialId)?.color }} />{' '}
                      {m.materialName} · {fmt(m.thickness)} — {m.count} part{m.count === 1 ? '' : 's'}
                    </span>
                    <button onClick={() => addStock(m.materialId, m.thickness)}>+ Add sheet</button>
                  </div>
                ))}
              </section>
            )}

            {tooBig.length > 0 && (
              <section className="cut-group cut-group--unplaced">
                <h3>Too big for the sheet</h3>
                <ul>
                  {tooBig.map((u) => (
                    <li key={u.panelId}>
                      {u.name} — larger than the {u.materialName} · {fmt(u.thickness)} sheet (minus margin)
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {noSpace.length > 0 && (
              <section className="cut-group cut-group--unplaced">
                <h3>Not enough stock</h3>
                <p className="cutlist-view__hint">
                  These parts fit, but the available sheet quantity ran out — raise a quantity or add more sheets:
                </p>
                <ul>
                  {noSpace.map((u) => (
                    <li key={u.panelId}>
                      {u.name} — {u.materialName} · {fmt(u.thickness)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {/* Print-only parts table: every part to cut, with its dimensions,
                so the printout carries the full list next to the diagrams. */}
            <section className="cutlist-print-list">
              <h3>Parts</h3>
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
                  {parts.filter((r) => includedOf(r.ids)).map((r, i) => (
                    <tr key={i}>
                      <td>{r.quantity}×</td>
                      <td>{partNames(r.parts)}</td>
                      <td>{fmt(r.length)} × {fmt(r.width)}</td>
                      <td>{fmt(r.thickness)}</td>
                      <td>{r.material}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </main>
        </div>

        {tip && (
          <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
            {tip.text}
          </div>
        )}
      </div>
    </div>
  )
}

/** One sheet drawn to scale, with its parts, kerf gaps, and margin border.
 *  Parts highlight on hover (and cross-highlight the grain list) and pop an
 *  instant tooltip so even the small ones can be identified. */
function SheetSvg({
  sheet,
  scale,
  margin,
  color,
  unit,
  hovered,
  onHover,
  onTip,
  printing,
}: {
  sheet: SheetLayout
  scale: number
  margin: number
  color: string
  unit: import('../../lib/units').Unit
  hovered: string[] | null
  onHover: (ids: string[] | null) => void
  onTip: (tip: { x: number; y: number; text: string } | null) => void
  printing: boolean
}) {
  const W = sheet.length * scale
  const H = sheet.width * scale
  const label = (mm: number) => formatMeasurement(mm, unit)

  // Print decisions per part: dimensions are shown whenever they fit; the name
  // is added only if there's extra room; parts too small get a letter that a
  // legend under the sheet spells out. Approx text widths in px at the label
  // font sizes (~5px/char) decide what fits along the part's long edge.
  const letterFor = (i: number) => {
    const base = String.fromCharCode(65 + (i % 26))
    const grp = Math.floor(i / 26)
    return grp ? `${base}${grp}` : base
  }
  const legend: { letter: string; text: string }[] = []
  const plan = sheet.placements.map((p) => {
    const pw = p.w * scale
    const ph = p.h * scale
    const wStr = label(p.w)
    const hStr = label(p.h)
    const size = `${wStr} × ${hStr}`
    const needW = wStr.length * 5 + 6 // width dim runs along the top edge
    const needH = hStr.length * 5 + 6 // height dim runs down the left edge
    const needDim = size.length * 5 + 6
    // Prefer the edge layout (dim on each edge). Thin strips that can't hold it
    // fall back to a single centred dim; anything smaller becomes a letter.
    let mode: 'edges' | 'dims' | 'letter'
    if (pw >= needW + 2 && ph >= needH + 2) mode = 'edges'
    else if (Math.min(pw, ph) >= 11 && Math.max(pw, ph) >= needDim) mode = 'dims'
    else mode = 'letter'
    // The name goes on the part when the inner area (clear of the edge dims)
    // can hold it. Every part WITHOUT a name gets a letter so the legend can
    // say what it is — you can always identify what you're cutting.
    const innerW = pw - 20
    const innerH = ph - 22
    const named = mode === 'edges' && innerW >= 34 && innerH >= 12
    let letter: string | undefined
    if (printing && !named) {
      letter = letterFor(legend.length)
      legend.push({ letter, text: `${p.name} · ${size}` })
    }
    return { size, wStr, hStr, mode, named, letter, innerW, innerH }
  })

  return (
    <figure className="sheet">
      <svg width={W} height={H} className="sheet__svg" role="img">
        <rect x={0} y={0} width={W} height={H} className="sheet__bg" />
        <rect
          x={margin * scale}
          y={margin * scale}
          width={W - 2 * margin * scale}
          height={H - 2 * margin * scale}
          className="sheet__margin"
        />
        {sheet.placements.map((p, i) => {
          const px = p.x * scale
          const py = p.y * scale
          const pw = p.w * scale
          const ph = p.h * scale
          const isHot = hovered?.includes(p.panelId)
          const { size, wStr, hStr, mode, named, letter, innerW, innerH } = plan[i]
          return (
            <g
              key={p.panelId}
              onMouseEnter={(e) => {
                onHover([p.panelId])
                onTip({
                  x: e.clientX,
                  y: e.clientY,
                  text: `${p.name} · ${label(p.w)} × ${label(p.h)}`,
                })
              }}
              onMouseMove={(e) => onTip({
                x: e.clientX,
                y: e.clientY,
                text: `${p.name} · ${label(p.w)} × ${label(p.h)}`,
              })}
              onMouseLeave={() => {
                onHover(null)
                onTip(null)
              }}
            >
              <rect
                x={px}
                y={py}
                width={pw}
                height={ph}
                fill={color}
                className={isHot ? 'sheet__part sheet__part--hover' : 'sheet__part'}
              />
              {printing ? (
                (() => {
                  const cx = px + pw / 2
                  const cy = py + ph / 2
                  if (mode === 'letter') {
                    return (
                      <foreignObject x={cx - 9} y={cy - 9} width={18} height={18}>
                        <div className="sheet__letter">{letter}</div>
                      </foreignObject>
                    )
                  }
                  if (mode === 'dims') {
                    // Thin strip: its letter + dim, rotated to run along its length.
                    const portrait = ph > pw
                    const bw = portrait ? ph : pw
                    const bh = portrait ? pw : ph
                    return (
                      <g transform={portrait ? `rotate(-90 ${cx} ${cy})` : undefined}>
                        <foreignObject x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} className="sheet__plabel-fo">
                          <div className="sheet__plabel sheet__plabel--row">
                            <span className="sheet__legend-key">{letter}</span>
                            <span className="sheet__plabel-size">{size}</span>
                          </div>
                        </foreignObject>
                      </g>
                    )
                  }
                  // Edge layout: width along the top, height down the left. The
                  // name sits centred when it fits; otherwise a letter does, and
                  // the legend below says which part it is.
                  return (
                    <>
                      <foreignObject x={cx - 40} y={py + 2} width={80} height={15}>
                        <div className="sheet__dim">
                          <span className="sheet__dim-chip">{wStr}</span>
                        </div>
                      </foreignObject>
                      <g transform={`rotate(-90 ${px + 10} ${cy})`}>
                        <foreignObject x={px + 10 - 40} y={cy - 8} width={80} height={15}>
                          <div className="sheet__dim">
                            <span className="sheet__dim-chip">{hStr}</span>
                          </div>
                        </foreignObject>
                      </g>
                      {named ? (
                        <foreignObject x={px + 16} y={py + 16} width={innerW} height={innerH} className="sheet__namebox">
                          <div className="sheet__plabel">
                            <span className="sheet__plabel-name">{p.name}</span>
                          </div>
                        </foreignObject>
                      ) : (
                        // Bottom-right corner — clear of the top/left edge dims.
                        <foreignObject x={px + pw - 16} y={py + ph - 16} width={14} height={14}>
                          <div className="sheet__letter">{letter}</div>
                        </foreignObject>
                      )}
                    </>
                  )
                })()
              ) : (
                <>
                  {pw > 34 && ph > 16 && (
                    <foreignObject x={px} y={py} width={pw} height={ph} className="sheet__label-fo">
                      <div className="sheet__label">
                        <span className="sheet__label-text">{p.name}</span>
                      </div>
                    </foreignObject>
                  )}
                  {isHot && (
                    <>
                      {/* Size on the sheet: width along the top, height down the left. */}
                      <foreignObject x={px + pw / 2 - 40} y={py + 2} width={80} height={18}>
                        <div className="sheet__dim">
                          <span className="sheet__dim-chip">{label(p.w)}</span>
                        </div>
                      </foreignObject>
                      <g transform={`rotate(-90 ${px + 11} ${py + ph / 2})`}>
                        <foreignObject x={px + 11 - 40} y={py + ph / 2 - 9} width={80} height={18}>
                          <div className="sheet__dim">
                            <span className="sheet__dim-chip">{label(p.h)}</span>
                          </div>
                        </foreignObject>
                      </g>
                    </>
                  )}
                </>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption>
        Sheet {sheet.index} · {label(sheet.length)} × {label(sheet.width)}
        <span className="sheet__grain-hint">↔ grain</span>
      </figcaption>
      {printing && legend.length > 0 && (
        <ul className="sheet__legend">
          {legend.map((e) => (
            <li key={e.letter}>
              <span className="sheet__legend-key">{e.letter}</span> {e.text}
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}

/** Combined preview + toggle for a part's grain. The rectangle turns to show
 *  how the part actually sits on the sheet (a `width`-grain part rotates 90°,
 *  same as before). Grain always lies along the sheet length once placed, so
 *  the overlaid glyph is ↔ for any constrained part and ↻ for a free one — the
 *  rect's rotation is what tells length from width grain apart. Click cycles
 *  width → length → free, replacing the old dropdown. */
function GrainThumb({
  length,
  width,
  grain,
  onClick,
  onTip,
}: {
  length: number
  width: number
  grain: Grain
  onClick: () => void
  onTip: (tip: { x: number; y: number; text: string } | null) => void
}) {
  const rotated = grain === 'width' // grain edge must lie along the sheet length
  const footW = rotated ? width : length // horizontal extent on the sheet
  const footH = rotated ? length : width

  const BOX_W = 40
  const BOX_H = 26
  const pad = 3
  const s = Math.min((BOX_W - 2 * pad) / footW, (BOX_H - 2 * pad) / footH)
  const w = Math.max(4, footW * s)
  const h = Math.max(4, footH * s)
  const x = (BOX_W - w) / 2
  const y = (BOX_H - h) / 2

  // Grain always lies along the sheet length once placed (the rect rotates to
  // show it), so the arrow is horizontal for any constrained part; free spins.
  const glyph = grain === 'none' ? '↻' : '↔'
  const title = `${GRAIN_LABEL[grain]} · click to change`

  return (
    <svg
      className="grain-thumb"
      width={BOX_W}
      height={BOX_H}
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onMouseEnter={(e) => onTip({ x: e.clientX, y: e.clientY, text: title })}
      onMouseMove={(e) => onTip({ x: e.clientX, y: e.clientY, text: title })}
      onMouseLeave={() => onTip(null)}
    >
      <rect x={x} y={y} width={w} height={h} rx={1.5} />
      <text x={BOX_W / 2} y={BOX_H / 2 + 3.5} textAnchor="middle" className="grain-thumb__glyph">
        {glyph}
      </text>
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
