import { useRef, useState } from 'react'
import { Vector3, type Group } from 'three'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { MM_TO_M } from '../../lib/geometry'
import { distance, panelCorners, type Point } from '../../lib/corners'
import { formatMeasurement } from '../../lib/units'
import { useDesignStore } from '../../store/designStore'

const toM = ([x, y, z]: Point): Point => [x * MM_TO_M, y * MM_TO_M, z * MM_TO_M]

const HIT_RADIUS = 0.03 // invisible click target (m)
const DOT_RADIUS = 0.004 // visible dot (m); grows on hover / selection
/** Distance (m) at which a dot renders at its base size; it scales linearly with
 *  camera distance so it keeps a constant on-screen size at any zoom. */
const NOMINAL_DIST = 1.5

/**
 * One pickable corner dot. Scales itself every frame so it stays the same size
 * on screen no matter the zoom (fixed-world dots ballooned when zoomed in), and
 * refuses clicks when a solid panel sits between it and the camera — you can
 * only pick corners you can actually see.
 */
function Corner({
  world,
  selected,
  active,
  onOver,
  onOut,
  onPick,
}: {
  world: Point
  selected: boolean
  active: boolean
  onOver: () => void
  onOut: () => void
  onPick: () => void
}) {
  const ref = useRef<Group>(null!)
  const pos = new Vector3(...toM(world))

  useFrame(({ camera }) => {
    if (ref.current) ref.current.scale.setScalar(camera.position.distanceTo(pos) / NOMINAL_DIST)
  })

  // Ignore the click if a (non-hidden) panel is nearer along the ray than this
  // corner — hidden panels raycast off, so corners behind them stay pickable.
  const occluded = (e: ThreeEvent<MouseEvent>) => {
    const cornerDist = e.ray.origin.distanceTo(pos)
    return e.intersections.some((i) => i.object.userData?.isPanel && i.distance < cornerDist - 0.002)
  }

  return (
    <group ref={ref} position={pos}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation()
          onOver()
        }}
        onPointerOut={onOut}
        onClick={(e) => {
          e.stopPropagation()
          if (!occluded(e)) onPick()
        }}
      >
        <sphereGeometry args={[HIT_RADIUS, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* depthTest on: a corner hidden behind a panel is not drawn, so only the
          corners you can see show up. */}
      <mesh>
        <sphereGeometry args={[active ? DOT_RADIUS * 1.8 : DOT_RADIUS, 16, 16]} />
        <meshBasicMaterial
          color={selected ? '#2a6cff' : active ? '#ffffff' : '#9fb4d8'}
          transparent
          opacity={active ? 1 : 0.5}
        />
      </mesh>
    </group>
  )
}

/**
 * Corner-based tools:
 *  - `move-snap`: pick a corner on one panel, then a corner on another; the
 *    first panel translates so the corners coincide.
 *  - `measure`: pick two corners; a line + distance label persist until the
 *    next measurement.
 * Corners show as small dots, brighter on hover; the first pick stays lit.
 */
export function ToolOverlay() {
  const tool = useDesignStore((s) => s.tool)
  const panels = useDesignStore((s) => s.panels)
  const unit = useDesignStore((s) => s.unit)
  const updatePanel = useDesignStore((s) => s.updatePanel)
  const pick = useDesignStore((s) => s.toolPick)
  const setToolPick = useDesignStore((s) => s.setToolPick)
  const measurement = useDesignStore((s) => s.measurement)
  const setMeasurement = useDesignStore((s) => s.setMeasurement)

  const [hovered, setHovered] = useState<string | null>(null)

  if (tool === 'move' || tool === 'resize') return null

  const handleCorner = (panelId: string, index: number, point: Point) => {
    if (!pick) {
      setToolPick({ panelId, index, point })
      if (tool === 'measure') setMeasurement(null)
      return
    }
    if (tool === 'move-snap') {
      const panel = panels.find((p) => p.id === pick.panelId)
      if (panel) {
        // Exact translation so the picked corners coincide precisely — no
        // rounding, which would leave them a hair apart.
        updatePanel(panel.id, {
          position: [
            panel.position[0] + (point[0] - pick.point[0]),
            panel.position[1] + (point[1] - pick.point[1]),
            panel.position[2] + (point[2] - pick.point[2]),
          ],
        })
      }
    } else {
      setMeasurement({ a: pick.point, b: point })
    }
    setToolPick(null)
  }

  return (
    <>
      {panels.flatMap((panel) =>
        panelCorners(panel).map((corner, i) => {
          const key = `${panel.id}:${i}`
          const selected = pick?.panelId === panel.id && pick.index === i
          return (
            <Corner
              key={key}
              world={corner}
              selected={selected}
              active={selected || hovered === key}
              onOver={() => setHovered(key)}
              onOut={() => setHovered((h) => (h === key ? null : h))}
              onPick={() => handleCorner(panel.id, i, corner)}
            />
          )
        }),
      )}

      {measurement && (
        <>
          <Line points={[toM(measurement.a), toM(measurement.b)]} color="#2a6cff" lineWidth={2} />
          <Html
            position={toM([
              (measurement.a[0] + measurement.b[0]) / 2,
              (measurement.a[1] + measurement.b[1]) / 2,
              (measurement.a[2] + measurement.b[2]) / 2,
            ])}
            center
            // Cap below the cutlist overlay (z-index 50) so it can't float over it.
            zIndexRange={[40, 0]}
          >
            <span className="measure-label">
              {formatMeasurement(distance(measurement.a, measurement.b), unit)}
            </span>
          </Html>
        </>
      )}
    </>
  )
}
