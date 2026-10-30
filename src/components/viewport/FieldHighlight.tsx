import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { Panel } from '../../types/panel'
import { axisField, toMetres } from '../../lib/geometry'
import { panelBounds } from '../../lib/bounds'
import { CORNER_SIGNS, cornerRadii } from '../../lib/rounding'
import { useDesignStore } from '../../store/designStore'
import { palette } from './palette'

type Vec3 = [number, number, number]
type AxisIndex = 0 | 1 | 2
type Segment = [Vec3, Vec3]

/** X / Y / Z in the colours the move arrows and the axis gizmo use, so a
 *  position field points the same way the arrow you'd drag does. */
const AXIS_COLORS = ['#ff3653', '#8adb00', '#2c8fff'] as const

/** Drawn under every highlight line, a little wider, so the line keeps a dark
 *  edge whatever it crosses — the lavender selection tint included. */
const HALO_COLOR = '#111317'

/** How far (mm) an axis line runs past the panel along that axis, and the
 *  least it reaches from the centre on each side — so along a thin panel's
 *  thickness it still clears the move arrows, without spanning the scene. */
const AXIS_OVERHANG = 80
const AXIS_MIN_HALF = 180

/**
 * The two edges that span a size: the pair of parallel box edges running along
 * the field's world axis on one face of the panel, so the highlight reads as
 * "from here to here" rather than a single line.
 *
 * For length or width that face is the panel's broad face (its + side), and the
 * edges sit at either side of it. For thickness the two edges are the short
 * ones at either end of one long edge.
 */
function sizeEdges(panel: Panel, field: 'length' | 'width' | 'thickness'): Segment[] {
  const axes: AxisIndex[] = [0, 1, 2]
  const axis = axes.find((a) => axisField(panel.normal, a) === field)
  if (axis === undefined) return []
  const normal = axes.find((a) => axisField(panel.normal, a) === 'thickness')!
  const { min, max } = panelBounds(panel)

  // `across` steps between the two edges; `fixed` pins which face they lie on.
  // Length / width: step across the face, on the panel's + side.
  // Thickness: step along one long edge's two ends.
  const [across, fixed] =
    axis === normal
      ? (axes.filter((a) => a !== axis) as [AxisIndex, AxisIndex])
      : [axes.find((a) => a !== axis && a !== normal)!, normal]

  return [min[across], max[across]].map((offset) => {
    const a: Vec3 = [0, 0, 0]
    a[across] = offset
    a[fixed] = max[fixed]
    const b: Vec3 = [...a]
    a[axis] = min[axis]
    b[axis] = max[axis]
    return [a, b] as Segment
  })
}

/** The line a position field moves the panel along: through its centre,
 *  reaching a little past the panel either side. */
function positionAxis(panel: Panel, axis: AxisIndex): Segment {
  const { min, max } = panelBounds(panel)
  const half = Math.max((max[axis] - min[axis]) / 2 + AXIS_OVERHANG, AXIS_MIN_HALF)
  const a: Vec3 = [...panel.position]
  const b: Vec3 = [...panel.position]
  a[axis] -= half
  b[axis] += half
  return [a, b]
}

/** How far (mm) along each edge a square corner's highlight reaches. */
const SQUARE_CORNER_ARM = 60

/**
 * A corner's outline on the panel's + face, as a polyline: the quarter arc of
 * a rounded corner, or for a square corner a short arm along each edge, so a
 * radius field always points at the corner it would round.
 */
function cornerOutline(panel: Panel, index: 0 | 1 | 2 | 3): Vec3[] {
  const axes: AxisIndex[] = [0, 1, 2]
  const uAxis = axes.find((a) => axisField(panel.normal, a) === 'length')!
  const vAxis = axes.find((a) => axisField(panel.normal, a) === 'width')!
  const nAxis = axes.find((a) => axisField(panel.normal, a) === 'thickness')!
  const { max } = panelBounds(panel)
  const [su, sv] = CORNER_SIGNS[index]
  const r = cornerRadii(panel)[index]
  const hu = panel.length / 2
  const hv = panel.width / 2

  const toWorld = (u: number, v: number): Vec3 => {
    const p: Vec3 = [...panel.position]
    p[uAxis] += u
    p[vAxis] += v
    p[nAxis] = max[nAxis]
    return p
  }

  if (r <= 0) {
    const arm = Math.min(SQUARE_CORNER_ARM, hu, hv)
    return [toWorld(su * hu, sv * (hv - arm)), toWorld(su * hu, sv * hv), toWorld(su * (hu - arm), sv * hv)]
  }
  const cu = su * (hu - r)
  const cv = sv * (hv - r)
  const start = Math.PI + (index * Math.PI) / 2
  return Array.from({ length: 13 }, (_, s) => {
    const a = start + (s / 12) * (Math.PI / 2)
    return toWorld(cu + r * Math.cos(a), cv + r * Math.sin(a))
  })
}

/**
 * Lights up, on every selected panel, what the panel-editor field under the
 * pointer (or in focus) edits: the two edges a length / width / thickness field
 * changes, the corner a radius field rounds, or the axis an X / Y / Z field
 * moves it along. Drawn over the model
 * (no depth test) with a dark halo, so it is never hidden behind another panel
 * and reads over any colour.
 */
export function FieldHighlight() {
  const highlight = useDesignStore((s) => s.fieldHover ?? s.fieldFocus)
  const selected = useDesignStore(
    useShallow((s) => s.panels.filter((p) => s.selectedIds.includes(p.id) && !p.hidden)),
  )
  const invalidate = useThree((s) => s.invalidate)

  // The canvas draws on demand; ask for a frame when the highlight comes and
  // goes, or the last one would linger on screen.
  useEffect(() => invalidate(), [highlight, invalidate])

  if (!highlight) return null

  const segments = selected.flatMap((panel) => {
    const lines: Vec3[][] =
      highlight.kind === 'size'
        ? sizeEdges(panel, highlight.field)
        : highlight.kind === 'corner'
          ? [cornerOutline(panel, highlight.index)]
          : [positionAxis(panel, highlight.axis)]
    return lines.map((ends, i) => ({ key: `${panel.id}:${i}`, ends }))
  })
  const color = highlight.kind === 'position' ? AXIS_COLORS[highlight.axis] : palette().fieldHighlight

  return (
    <>
      {segments.map(({ key, ends }) => {
        const points = ends.map(toMetres)
        return (
          <group key={key}>
            <Line points={points} color={HALO_COLOR} lineWidth={8} depthTest={false} renderOrder={10} />
            <Line points={points} color={color} lineWidth={4} depthTest={false} renderOrder={11} />
            {/* End caps, so even a short edge (a thickness) reads as a span. */}
            {[points[0], points[points.length - 1]].map((end, i) => (
              <mesh key={i} position={end} renderOrder={11}>
                <sphereGeometry args={[0.007, 12, 12]} />
                <meshBasicMaterial color={color} depthTest={false} />
              </mesh>
            ))}
          </group>
        )
      })}
    </>
  )
}
