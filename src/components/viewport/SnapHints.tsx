import { Html, Line } from '@react-three/drei'
import { MM_TO_M } from '../../lib/geometry'
import type { SnapKind } from '../../lib/snapping'
import { useDesignStore } from '../../store/designStore'

type Vec3 = [number, number, number]

/** Colour + label for each snap kind, matched to the readout palette. */
const KIND: Record<SnapKind, { color: string; label: string }> = {
  butt: { color: '#2a6cff', label: 'Butt' },
  middle: { color: '#ffb02e', label: 'Middle' },
}

/** The guide is drawn on the exact contact rectangle (no outward padding) so it
 *  marks precisely where the two panels meet. */
const PAD_MM = 0

/**
 * Live snap guides drawn during a move drag. Each hint is a rectangle lying in
 * the snap plane (sized to the moving panel's face on that axis) plus a floating
 * label naming the snap — so it's obvious whether an edge landed on a
 * neighbour's face (`Edge`), butted against it (`Butt`), or hit its centre line
 * (`Middle`). Purely a projection of `snapHints`; renders nothing when idle.
 */
export function SnapHints() {
  const hints = useDesignStore((s) => s.snapHints)
  if (hints.length === 0) return null

  return (
    <>
      {hints.map((hint, i) => {
        const { color, label } = KIND[hint.kind]
        // The two in-plane axes are the ones the plane's normal (hint.axis) isn't.
        const [u, v] = ([0, 1, 2] as const).filter((a) => a !== hint.axis) as [number, number]
        const hu = hint.size[u] / 2 + PAD_MM
        const hv = hint.size[v] / 2 + PAD_MM

        // Four corners of the framing rectangle, in world mm, closed back to the
        // start so the outline joins up.
        const corner = (su: number, sv: number): Vec3 => {
          const p: Vec3 = [...hint.at]
          p[u] += su * hu
          p[v] += sv * hv
          return p.map((mm) => mm * MM_TO_M) as Vec3
        }
        const points: Vec3[] = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)]
        const labelAt = hint.at.map((mm) => mm * MM_TO_M) as Vec3

        return (
          <group key={i}>
            <Line points={points} color={color} lineWidth={2} transparent opacity={0.9} depthTest={false} />
            {hint.label !== false && (
              <Html position={labelAt} center zIndexRange={[40, 0]}>
                <span className="snap-label" style={{ background: color }}>
                  {label}
                </span>
              </Html>
            )}
          </group>
        )
      })}
    </>
  )
}
