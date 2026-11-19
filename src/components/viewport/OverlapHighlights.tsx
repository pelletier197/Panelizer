import { useMemo, useState } from 'react'
import { Edges } from '@react-three/drei'
import { toMetres } from '../../lib/geometry'
import { jointMarkers, type JointMarker } from '../../lib/overlaps'
import { jointGroup } from '../../lib/joints'
import { palette } from './palette'
import { useDesignStore } from '../../store/designStore'

/** Slightly grow each overlay so it pokes through the panels and doesn't
 *  z-fight with their faces (mm). */
const PAD = 1.5
/** The least a marker is to the pointer, on every axis (mm). */
const HIT = 12

type Vec3 = [number, number, number]

/**
 * A marker wherever two panels share space: a translucent block while the
 * joint isn't cut (a cue that a joint lives there — not an error), a faint
 * outline once it is. Clicking either opens the joint editor on it.
 */
export function OverlapHighlights() {
  const panels = useDesignStore((s) => s.panels)
  const markers = useMemo(() => jointMarkers(panels), [panels])
  const setJointEditor = useDesignStore((s) => s.setJointEditor)
  const [hovered, setHovered] = useState<number | null>(null)
  const paint = palette()

  // A marker opens every part that meets there, not just its pair.
  const open = (marker: JointMarker) => {
    const a = panels.find((p) => p.id === marker.a)!
    const b = panels.find((p) => p.id === marker.b)!
    setJointEditor(jointGroup(panels, a, b).map((p) => p.id))
  }

  return (
    <>
      {markers.map((marker, i) => {
        const lit = hovered === i
        return (
          <mesh
            key={`${marker.a}:${marker.b}`}
            position={toMetres(marker.center)}
            onClick={(e) => {
              e.stopPropagation()
              open(marker)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHovered(i)
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              setHovered((h) => (h === i ? null : h))
              document.body.style.cursor = ''
            }}
          >
            {/* What the pointer hits: never thinner than HIT, so a dado's
                sliver of overlap can still be clicked. Not drawn. */}
            <boxGeometry args={toMetres(marker.size.map((s) => Math.max(s + PAD, HIT)) as Vec3)} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
            <mesh raycast={() => null}>
              <boxGeometry args={toMetres(marker.size.map((s) => s + PAD) as Vec3)} />
              <meshStandardMaterial
                color={paint.overlap}
                emissive={paint.overlap}
                emissiveIntensity={lit ? 0.8 : 0.4}
                transparent
                // A cut joint is just its outline, until pointed at.
                opacity={marker.cut ? (lit ? 0.25 : 0) : lit ? 0.75 : 0.55}
                depthWrite={false}
              />
              {(marker.cut || lit) && <Edges color={paint.overlap} />}
            </mesh>
          </mesh>
        )
      })}
    </>
  )
}
