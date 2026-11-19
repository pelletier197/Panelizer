import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import type { Panel } from '../../types/panel'
import type { Bounds } from '../../lib/bounds'
import { toMetres } from '../../lib/geometry'
import { localSolid, panelSolids } from '../../lib/cuts'
import { useDesignStore } from '../../store/designStore'
import { panelGeometry } from './panelGeometry'
import { palette } from './palette'

/** Ghosts of where the selection would land if the hovered rotate, mirror or
 *  arrange button were pressed: a faint accent-tinted copy of each panel's
 *  shape — rounded corners and cut joints included — with a bright outline,
 *  so the change reads before it's committed. Never clickable, never part of
 *  the design. */
export function RotatePreview() {
  const ghosts = useDesignStore((s) => s.rotatePreview)
  const invalidate = useThree((s) => s.invalidate)
  const paint = palette()

  // The canvas only draws on demand, and unmounting a mesh doesn't ask for a
  // frame — without this the last ghost stays painted after the pointer leaves
  // the button, until something else (hovering a panel) forces a redraw.
  useEffect(() => invalidate(), [ghosts, invalidate])

  // A row of repeated copies lists the same ids once per copy: each copy's
  // joints are worked out among that copy's parts only.
  const shapes = useMemo(() => {
    const out: (Bounds[] | null)[] = []
    let chunk: Panel[] = []
    const flush = () => {
      const solids = panelSolids(chunk)
      for (const p of chunk) out.push(localSolid(p, solids.get(p.id)))
      chunk = []
    }
    for (const p of ghosts) {
      if (chunk.some((c) => c.id === p.id)) flush()
      chunk.push(p)
    }
    flush()
    return out
  }, [ghosts])

  return (
    <>
      {ghosts.map((panel, i) => (
        <Ghost key={i} panel={panel} solid={shapes[i]} color={paint.accent} />
      ))}
    </>
  )
}

function Ghost({ panel, solid, color }: { panel: Panel; solid: Bounds[] | null; color: string }) {
  const geometry = useMemo(() => panelGeometry(panel, solid), [panel, solid])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={toMetres(panel.position)} raycast={() => null}>
      <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
      <Edges threshold={15} color={color} />
    </mesh>
  )
}
