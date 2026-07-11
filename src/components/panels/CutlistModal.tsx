import { useEffect, useMemo, useRef, useState } from 'react'
import type { Grain } from '../../types/panel'
import { generateCutlist, type SheetLayout } from '../../lib/nesting'
import { buildParts, partNames, type PartRow } from '../../lib/parts'
import { formatMeasurement } from '../../lib/units'
import { useDesignStore } from '../../store/designStore'
import { MeasurementInput } from '../ui/MeasurementInput'

const GRAINS: { value: Grain; label: string }[] = [
  { value: 'length', label: 'Length' },
  { value: 'width', label: 'Width' },
  { value: 'none', label: 'Free' },
]

/** Longest sheet drawn this wide (px); everything else scales to match. */
const SHEET_MAX_PX = 360

/** Controls-panel width bounds + persisted UI preference. */
const CONTROLS_MIN = 240
const CONTROLS_MAX = 640
const CONTROLS_KEY = 'wood3d.ui.cutlistControls'
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

  const result = useMemo(
    () => generateCutlist(panels, materials, stocks, kerf, margin),
    [panels, materials, stocks, kerf, margin],
  )
  const parts = useMemo(() => buildParts(panels, materials), [panels, materials])
  const grainOf = (ids: string[]) => panels.find((p) => p.id === ids[0])?.grain ?? 'length'

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
    return unplacedReason.get(id) === 'too-big' ? 'Too big for the sheet' : 'No matching stock'
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

  return (
    <div className="cutlist-overlay" onClick={() => setOpen(false)}>
      <div className="cutlist-view" onClick={(e) => e.stopPropagation()}>
        <header className="cutlist-view__header">
          <h2>Cutlist</h2>
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
                <button onClick={() => addStock(materials[0].id)}>+ Add</button>
              </div>
              {stocks.length === 0 && (
                <p className="cutlist-view__hint">Add the sheets you have — parts nest onto stock of the same material and thickness.</p>
              )}
              {stocks.map((s) => (
                <div className="stock" key={s.id}>
                  <div className="stock__row">
                    <select value={s.materialId} onChange={(e) => updateStock(s.id, { materialId: e.target.value })}>
                      {materials.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <button className="material__remove" aria-label="Remove stock" onClick={() => removeStock(s.id)}>
                      ✕
                    </button>
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
                </div>
              ))}
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
                        return (
                          <tr
                            key={i}
                            className={isHovered(r.ids) ? 'is-hover' : ''}
                            onMouseEnter={() => setHovered(r.ids)}
                            onMouseLeave={() => setHovered(null)}
                          >
                            <td>
                              <GrainThumb length={r.length} width={r.width} grain={grainOf(r.ids)} />
                            </td>
                            <td className="parts__name">
                              {partNames(r.parts)}
                              {note && (
                                <span className="grain-warn" title={note}>
                                  ⚠
                                </span>
                              )}
                            </td>
                            <td>{r.quantity}×</td>
                            <td>
                              {fmt(r.length)} × {fmt(r.width)}
                            </td>
                            <td>
                              <select
                                value={grainOf(r.ids)}
                                onChange={(e) => r.ids.forEach((id) => updatePanel(id, { grain: e.target.value as Grain }))}
                              >
                                {GRAINS.map((g) => (
                                  <option key={g.value} value={g.value}>
                                    {g.label}
                                  </option>
                                ))}
                              </select>
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
              const sheetArea = g.sheetLength * g.sheetWidth
              const used = g.sheets.reduce((sum, s) => sum + s.usedArea, 0)
              const waste = g.sheets.length ? Math.round((1 - used / (g.sheets.length * sheetArea)) * 100) : 0
              return (
                <section className="cut-group" key={g.key}>
                  <h3>
                    <span className="parts__swatch" style={{ background: g.color }} /> {g.materialName} · {fmt(g.thickness)}
                    <span className="cut-group__stats">
                      {g.sheets.length} sheet{g.sheets.length === 1 ? '' : 's'} · {waste}% waste
                      {g.short && <span className="cut-group__short"> · exceeds stock qty ({g.quantity})</span>}
                    </span>
                  </h3>
                  <div className="cut-group__sheets">
                    {g.sheets.map((s) => (
                      <SheetSvg
                        key={s.index}
                        sheet={s}
                        margin={margin}
                        color={g.color}
                        unit={unit}
                        hovered={hovered}
                        onHover={setHovered}
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
          </main>
        </div>
      </div>
    </div>
  )
}

/** One sheet drawn to scale, with its parts, kerf gaps, and margin border.
 *  Parts highlight on hover (and cross-highlight the grain list) and carry a
 *  native tooltip so even the small ones can be identified. */
function SheetSvg({
  sheet,
  margin,
  color,
  unit,
  hovered,
  onHover,
}: {
  sheet: SheetLayout
  margin: number
  color: string
  unit: import('../../lib/units').Unit
  hovered: string[] | null
  onHover: (ids: string[] | null) => void
}) {
  const scale = SHEET_MAX_PX / sheet.length
  const W = sheet.length * scale
  const H = sheet.width * scale
  const label = (mm: number) => formatMeasurement(mm, unit)

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
        {sheet.placements.map((p) => {
          const px = p.x * scale
          const py = p.y * scale
          const pw = p.w * scale
          const ph = p.h * scale
          const isHot = hovered?.includes(p.panelId)
          return (
            <g
              key={p.panelId}
              onMouseEnter={() => onHover([p.panelId])}
              onMouseLeave={() => onHover(null)}
            >
              <rect
                x={px}
                y={py}
                width={pw}
                height={ph}
                fill={color}
                className={isHot ? 'sheet__part sheet__part--hover' : 'sheet__part'}
              >
                <title>
                  {p.name} · {label(p.w)} × {label(p.h)}
                  {p.rotated ? ' (rotated)' : ''}
                </title>
              </rect>
              {pw > 34 && ph > 16 && (
                <text x={px + pw / 2} y={py + ph / 2} className="sheet__label">
                  {p.name}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <figcaption>
        Sheet {sheet.index} · {label(sheet.length)} × {label(sheet.width)}
      </figcaption>
    </figure>
  )
}

/** A tiny orientation preview: the part drawn length-horizontal, with grain
 *  lines showing which edge the grain runs along (free parts show a ↻). */
function GrainThumb({ length, width, grain }: { length: number; width: number; grain: Grain }) {
  const BOX_W = 36
  const BOX_H = 24
  const pad = 3
  const s = Math.min((BOX_W - 2 * pad) / length, (BOX_H - 2 * pad) / width)
  const w = Math.max(4, length * s)
  const h = Math.max(4, width * s)
  const x = (BOX_W - w) / 2
  const y = (BOX_H - h) / 2

  const lines = []
  const n = 3
  if (grain === 'length') {
    for (let i = 1; i <= n; i++) {
      const yy = y + (h * i) / (n + 1)
      lines.push(<line key={i} x1={x + 2} y1={yy} x2={x + w - 2} y2={yy} />)
    }
  } else if (grain === 'width') {
    for (let i = 1; i <= n; i++) {
      const xx = x + (w * i) / (n + 1)
      lines.push(<line key={i} x1={xx} y1={y + 2} x2={xx} y2={y + h - 2} />)
    }
  }

  const title = grain === 'none' ? 'Free (no grain)' : `Grain along ${grain}`
  return (
    <svg className="grain-thumb" width={BOX_W} height={BOX_H} aria-hidden>
      <title>{title}</title>
      <rect x={x} y={y} width={w} height={h} rx={1.5} />
      {lines}
      {grain === 'none' && (
        <text x={BOX_W / 2} y={BOX_H / 2 + 3.5} textAnchor="middle" className="grain-thumb__free">
          ↻
        </text>
      )}
    </svg>
  )
}
