import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import { panelBoxSize, toMetres } from '../../lib/geometry'
import { useDesignStore } from '../../store/designStore'
import { palette } from './palette'

/** Ghosts of where the selection would land if the hovered rotate button were
 *  pressed: a faint accent-tinted box with a bright outline per panel, so the
 *  turn reads before it's committed. Never clickable, never part of the
 *  design. */
export function RotatePreview() {
  const ghosts = useDesignStore((s) => s.rotatePreview)
  const invalidate = useThree((s) => s.invalidate)
  const paint = palette()

  // The canvas only draws on demand, and unmounting a mesh doesn't ask for a
  // frame — without this the last ghost stays painted after the pointer leaves
  // the button, until something else (hovering a panel) forces a redraw.
  useEffect(() => invalidate(), [ghosts, invalidate])

  return (
    <>
      {ghosts.map((panel) => (
        <mesh key={panel.id} position={toMetres(panel.position)} raycast={() => null}>
          <boxGeometry args={toMetres(panelBoxSize(panel))} />
          <meshBasicMaterial color={paint.accent} transparent opacity={0.18} depthWrite={false} />
          <Edges threshold={15} color={paint.accent} />
        </mesh>
      ))}
    </>
  )
}
