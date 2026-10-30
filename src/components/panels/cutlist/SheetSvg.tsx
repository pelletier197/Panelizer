import type { Placement, SheetLayout } from '../../../lib/nesting'
import { roundedRectPath, squaredCornersPath, type CornerRadii } from '../../../lib/rounding'
import { formatMeasurement, type Unit } from '../../../lib/units'
import { planPlacements, type PlacementPlan } from './sheetPlan'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'

/** Geometry of one placed part in screen px, shared by both label renderers. */
interface PartBox {
  x: number
  y: number
  w: number
  h: number
}

const SQUARE: CornerRadii = [0, 0, 0, 0]

/**
 * One sheet drawn to scale, with its parts, kerf gaps, and margin border.
 * Parts highlight on hover (and cross-highlight the grain list) and pop an
 * instant tooltip so even the small ones can be identified.
 */
export function SheetSvg({
  sheet,
  scale,
  margin,
  color,
  unit,
  hovered,
  onHover,
  showTip,
  hideTip,
  printing,
  onExportDxf,
}: {
  sheet: SheetLayout
  scale: number
  margin: number
  color: string
  unit: Unit
  hovered: string[] | null
  onHover: (ids: string[] | null) => void
  showTip: (e: { clientX: number; clientY: number }, text: string) => void
  hideTip: () => void
  printing: boolean
  /** Download this sheet as a DXF, for CNC software. */
  onExportDxf: () => void
}) {
  const W = sheet.length * scale
  const H = sheet.width * scale
  const label = (mm: number) => formatMeasurement(mm, unit)
  const { plan, legend } = planPlacements(sheet.placements, scale, label, printing)

  return (
    <figure data-sheet className="m-0">
      <svg width={W} height={H} className="block rounded-xs" role="img">
        <rect x={0} y={0} width={W} height={H} data-sheet-bg
          className="fill-surface-2 stroke-edge" />
        <rect
          x={margin * scale}
          y={margin * scale}
          width={W - 2 * margin * scale}
          height={H - 2 * margin * scale}
          data-sheet-margin
          className="fill-none stroke-edge [stroke-dasharray:4_3]"
        />
        {sheet.placements.map((p, i) => {
          const box: PartBox = { x: p.x * scale, y: p.y * scale, w: p.w * scale, h: p.h * scale }
          const isHot = hovered?.includes(p.panelId) ?? false
          const tipText = `${p.name} · ${label(p.w)} × ${label(p.h)}`

          return (
            <g
              key={p.panelId}
              onMouseEnter={(e) => {
                onHover([p.panelId])
                showTip(e, tipText)
              }}
              onMouseMove={(e) => showTip(e, tipText)}
              onMouseLeave={() => {
                onHover(null)
                hideTip()
              }}
            >
              <path
                d={roundedRectPath(box.x, box.y, box.w, box.h, (p.corners ?? SQUARE).map((r) => r * scale) as CornerRadii)}
                fill={color}
                data-sheet-part
                className={cx(
                  'cursor-default',
                  isHot
                    ? 'stroke-white [fill-opacity:1] [stroke-width:2.5]'
                    : 'stroke-black/55 [fill-opacity:0.85] [stroke-width:1]',
                )}
              />
              {/* A rounded part is packed — and first cut on the saw — as its
                  full rectangle; dot in the square corners the rounding then
                  takes off, so the curve shows against what was cut. */}
              {p.corners && (
                <path
                  d={squaredCornersPath(box.x, box.y, box.w, box.h, p.corners.map((r) => r * scale) as CornerRadii)}
                  data-sheet-cut-outline
                  className="pointer-events-none fill-none stroke-ink-dim [stroke-dasharray:3_2] [stroke-width:1]"
                />
              )}
              {printing ? (
                <PrintLabel placement={p} box={box} plan={plan[i]} />
              ) : (
                <ScreenLabel placement={p} box={box} isHot={isHot} label={label} />
              )}
            </g>
          )
        })}
      </svg>

      <figcaption className="mt-1 flex items-center text-xs text-ink-dim">
        Sheet {sheet.index} · {label(sheet.length)} × {label(sheet.width)}
        <span className="ml-2 rounded-full border border-accent/45 bg-accent/20 px-1.5 py-px text-[9px] whitespace-nowrap text-accent-ink">
          ↔ grain
        </span>
        {!printing && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto print:hidden"
            title="Download this sheet as a DXF drawing (mm) for CNC software"
            onClick={onExportDxf}
          >
            ↓ DXF
          </Button>
        )}
      </figcaption>

      {printing && legend.length > 0 && (
        <ul className="mt-1 grid list-none grid-cols-2 gap-x-3 p-0 text-[9px] text-ink-dim">
          {legend.map((entry) => (
            <li key={entry.letter}>
              <LegendKey>{entry.letter}</LegendKey> {entry.text}
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}

/** Legend key badge, shared by the sheet legend and the thin-strip labels. */
function LegendKey({ children }: { children: React.ReactNode }) {
  return (
    <span data-chip className="inline-block min-w-3.5 rounded-xs bg-black/45 px-1 text-center font-bold text-white">
      {children}
    </span>
  )
}

const LETTER_BADGE =
  'flex h-full w-full items-center justify-center rounded-xs bg-black/45 text-[10px] font-bold text-white'

const DIM_ROW = 'flex h-full w-full items-center justify-center'
const DIM_CHIP =
  'rounded-xs bg-black/45 px-1 text-[9px] font-semibold text-white tabular-nums whitespace-nowrap'

/** A dimension chip, optionally rotated to run down a part's left edge. */
function DimChip({
  x,
  y,
  text,
  height = 15,
  rotateAbout,
}: {
  x: number
  y: number
  text: string
  height?: number
  rotateAbout?: [number, number]
}) {
  const chip = (
    <foreignObject x={x} y={y} width={80} height={height}>
      <div className={DIM_ROW}>
        <span data-chip className={DIM_CHIP}>{text}</span>
      </div>
    </foreignObject>
  )
  if (!rotateAbout) return chip
  return <g transform={`rotate(-90 ${rotateAbout[0]} ${rotateAbout[1]})`}>{chip}</g>
}

/**
 * Print labelling: always shows as much as fits, because a printout can't be
 * hovered. Falls back through edge dims → a single rotated dim → a legend
 * letter as parts get smaller.
 */
function PrintLabel({ placement, box, plan }: { placement: Placement; box: PartBox; plan: PlacementPlan }) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const { mode, size, wStr, hStr, named, letter, innerW, innerH } = plan

  if (mode === 'letter') {
    return (
      <foreignObject x={cx - 9} y={cy - 9} width={18} height={18}>
        <div data-chip className={LETTER_BADGE}>{letter}</div>
      </foreignObject>
    )
  }

  if (mode === 'dims') {
    // Thin strip: its letter + dim, rotated to run along its length.
    const portrait = box.h > box.w
    const bw = portrait ? box.h : box.w
    const bh = portrait ? box.w : box.h
    return (
      <g transform={portrait ? `rotate(-90 ${cx} ${cy})` : undefined}>
        <foreignObject x={cx - bw / 2} y={cy - bh / 2} width={bw} height={bh} className="overflow-visible">
          <div className="flex h-full w-full flex-row items-center justify-center gap-1 text-center leading-tight text-ink">
            <LegendKey>{letter}</LegendKey>
            <span className="text-[9px] tabular-nums">{size}</span>
          </div>
        </foreignObject>
      </g>
    )
  }

  // Edge layout: width along the top, height down the left. The name sits
  // centred when it fits; otherwise a letter does, and the legend says which
  // part it is.
  return (
    <>
      <DimChip x={cx - 40} y={box.y + 2} text={wStr} />
      <DimChip x={box.x + 10 - 40} y={cy - 8} text={hStr} rotateAbout={[box.x + 10, cy]} />
      {named ? (
        // Clipped so a long name can't spill onto the edge dims or a neighbour.
        <foreignObject x={box.x + 16} y={box.y + 16} width={innerW} height={innerH} className="overflow-hidden">
          <div className="flex h-full w-full flex-col items-center justify-center text-center leading-tight text-ink">
            <span className="text-[10px] font-bold [overflow-wrap:anywhere]">{placement.name}</span>
          </div>
        </foreignObject>
      ) : (
        // Bottom-right corner — clear of the top/left edge dims.
        <foreignObject x={box.x + box.w - 16} y={box.y + box.h - 16} width={14} height={14}>
          <div data-chip className={LETTER_BADGE}>{letter}</div>
        </foreignObject>
      )}
    </>
  )
}

/** Screen labelling: just the name, with dimensions revealed on hover. */
function ScreenLabel({
  placement,
  box,
  isHot,
  label,
}: {
  placement: Placement
  box: PartBox
  isHot: boolean
  label: (mm: number) => string
}) {
  return (
    <>
      {box.w > 34 && box.h > 16 && (
        <foreignObject
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          className="pointer-events-none overflow-hidden"
        >
          <div className="flex h-full w-full items-center justify-center p-0.5">
            <span className="max-w-full rounded-sm bg-black/35 px-1.5 py-px text-center text-[9px] leading-tight font-semibold text-white [overflow-wrap:anywhere]">
              {placement.name}
            </span>
          </div>
        </foreignObject>
      )}
      {isHot && (
        <>
          {/* Size on the sheet: width along the top, height down the left. */}
          <DimChip x={box.x + box.w / 2 - 40} y={box.y + 2} text={label(placement.w)} height={18} />
          <DimChip
            x={box.x + 11 - 40}
            y={box.y + box.h / 2 - 9}
            text={label(placement.h)}
            height={18}
            rotateAbout={[box.x + 11, box.y + box.h / 2]}
          />
        </>
      )}
    </>
  )
}
