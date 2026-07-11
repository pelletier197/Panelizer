import { useRef } from 'react'
import type { Mesh } from 'three'
import { Edges, TransformControls } from '@react-three/drei'
import type { Panel } from '../../types/panel'
import { MM_TO_M, panelBoxSize } from '../../lib/geometry'
import { findMaterial } from '../../lib/materials'
import { SNAP_THRESHOLD_MM, snapGroupDelta } from '../../lib/snapping'
import { useDesignStore } from '../../store/designStore'
import { ResizeHandles } from './ResizeHandles'

const toMetres = ([x, y, z]: [number, number, number]): [number, number, number] => [
  x * MM_TO_M,
  y * MM_TO_M,
  z * MM_TO_M,
]

/** Renders one panel as a box, handles click-to-select, and — when selected —
 *  attaches a translate gizmo. Dragging only moves the panel; its size (and so
 *  its thickness) is never touched here, matching the "thickness is locked in
 *  the viewport" rule. */
type Vec3 = [number, number, number]

export function PanelMesh({ panel }: { panel: Panel }) {
  const meshRef = useRef<Mesh>(null!)
  const selectedIds = useDesignStore((s) => s.selectedIds)
  const sceneSelect = useDesignStore((s) => s.sceneSelect)
  const movePanelsLive = useDesignStore((s) => s.movePanelsLive)
  const commitPanelsMove = useDesignStore((s) => s.commitPanelsMove)
  const armSelectSuppression = useDesignStore((s) => s.armSelectSuppression)
  const panels = useDesignStore((s) => s.panels)
  const tool = useDesignStore((s) => s.tool)
  const color = useDesignStore((s) => findMaterial(s.materials, panel.materialId).color)

  const selected = selectedIds.includes(panel.id)
  // The last-selected panel carries the move gizmo for the whole group.
  const isPrimary = selectedIds[selectedIds.length - 1] === panel.id

  // Positions of every selected panel frozen at pointer-down, so the whole
  // group moves rigidly by the primary's displacement.
  const groupStart = useRef<{ id: string; position: Vec3 }[]>([])

  const size = toMetres(panelBoxSize(panel))
  const position = toMetres(panel.position)

  const beginDrag = () => {
    groupStart.current = panels
      .filter((p) => selectedIds.includes(p.id))
      .map((p) => ({ id: p.id, position: p.position }))
  }

  // Drag: the gizmo moves the primary by a raw delta; snapGroupDelta then finds
  // the correction that lands *any* group member on a neighbour edge, so the
  // whole formation snaps together (not just the panel under the gizmo).
  const dragGroup = () => {
    const obj = meshRef.current
    if (!obj) return
    const start = groupStart.current
    if (start.length === 0) return
    const primaryStart = start.find((s) => s.id === panel.id)?.position ?? panel.position
    const raw: Vec3 = [
      obj.position.x / MM_TO_M - primaryStart[0],
      obj.position.y / MM_TO_M - primaryStart[1],
      obj.position.z / MM_TO_M - primaryStart[2],
    ]

    const byId = new Map(panels.map((p) => [p.id, p]))
    const proposed = start.map((s) => ({
      panel: byId.get(s.id)!,
      position: [s.position[0] + raw[0], s.position[1] + raw[1], s.position[2] + raw[2]] as Vec3,
    }))
    const others = panels.filter((p) => !selectedIds.includes(p.id))
    const corr = snapGroupDelta(proposed, others, SNAP_THRESHOLD_MM)
    const delta: Vec3 = [raw[0] + corr[0], raw[1] + corr[1], raw[2] + corr[2]]

    // Keep the gizmo glued to the snapped primary position.
    obj.position.set(
      (primaryStart[0] + delta[0]) * MM_TO_M,
      (primaryStart[1] + delta[1]) * MM_TO_M,
      (primaryStart[2] + delta[2]) * MM_TO_M,
    )
    movePanelsLive(
      start.map((s) => ({
        id: s.id,
        position: [s.position[0] + delta[0], s.position[1] + delta[1], s.position[2] + delta[2]],
      })),
    )
  }

  const commitGroup = () => {
    commitPanelsMove(
      panels
        .filter((p) => selectedIds.includes(p.id))
        .map((p) => ({ id: p.id, position: p.position.map(Math.round) as Vec3 })),
    )
    armSelectSuppression() // don't let the drag-release click reselect a panel
  }

  return (
    <>
      <mesh
        ref={meshRef}
        position={position}
        onClick={(e) => {
          e.stopPropagation()
          sceneSelect(panel.id, e.nativeEvent.shiftKey)
        }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          emissive={selected ? '#2a6cff' : '#000000'}
          emissiveIntensity={selected ? 0.35 : 0}
        />
        <Edges threshold={15} color={selected ? '#2a6cff' : '#5a4a32'} />
      </mesh>

      {selected && isPrimary && tool === 'move' && (
        <TransformControls
          object={meshRef}
          mode="translate"
          onMouseDown={beginDrag}
          onObjectChange={dragGroup}
          onMouseUp={commitGroup}
        />
      )}

      {selected && selectedIds.length === 1 && tool === 'resize' && <ResizeHandles panel={panel} />}
    </>
  )
}
