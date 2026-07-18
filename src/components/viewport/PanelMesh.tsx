import { useRef } from 'react'
import { Mesh } from 'three'
import { Edges, TransformControls } from '@react-three/drei'
import type { Panel } from '../../types/panel'
import { MM_TO_M, panelBoxSize } from '../../lib/geometry'
import { findMaterial } from '../../lib/materials'
import { SNAP_THRESHOLD_MM, snapGroupDelta } from '../../lib/snapping'
import { useDesignStore } from '../../store/designStore'
import { ResizeHandles } from './ResizeHandles'

type Vec3 = [number, number, number]

const toMetres = ([x, y, z]: Vec3): Vec3 => [x * MM_TO_M, y * MM_TO_M, z * MM_TO_M]

/** A gesture that moved the primary less than this (mm) is a click, not a drag. */
const MOVE_THRESHOLD_MM = 0.5
const AXIS_NAME = ['X', 'Y', 'Z'] as const

// A hidden panel opts out of ray-picking; a visible one uses Three's default.
// Passing the explicit default (not `undefined`) is what lets a re-shown panel
// become clickable again — r3f won't restore the default on its own.
const NULL_RAYCAST = () => null
const DEFAULT_RAYCAST = Mesh.prototype.raycast

/** The active axis of a translate drag, inferred from the raw displacement: a
 *  single-axis gizmo drag moves along exactly one axis (the other two stay 0),
 *  a plane drag moves along two. Returns null for a plane/no-op drag. */
function singleAxis(raw: Vec3): 0 | 1 | 2 | null {
  const moving = ([0, 1, 2] as const).filter((a) => Math.abs(raw[a]) > 1e-4)
  return moving.length === 1 ? moving[0] : null
}

/** Renders one panel as a box, handles click-to-select, and — when selected —
 *  attaches a translate gizmo. Dragging only moves the panel; its size (and so
 *  its thickness) is never touched here, matching the "thickness is locked in
 *  the viewport" rule. */
export function PanelMesh({ panel }: { panel: Panel }) {
  const meshRef = useRef<Mesh>(null!)
  const selectedIds = useDesignStore((s) => s.selectedIds)
  const sceneSelect = useDesignStore((s) => s.sceneSelect)
  const movePanelsLive = useDesignStore((s) => s.movePanelsLive)
  const commitPanelsMove = useDesignStore((s) => s.commitPanelsMove)
  const restorePanels = useDesignStore((s) => s.restorePanels)
  const armSelectSuppression = useDesignStore((s) => s.armSelectSuppression)
  const startGesture = useDesignStore((s) => s.startGesture)
  const setGestureDelta = useDesignStore((s) => s.setGestureDelta)
  const setGestureEditable = useDesignStore((s) => s.setGestureEditable)
  const clearGesture = useDesignStore((s) => s.clearGesture)
  const setSnapHints = useDesignStore((s) => s.setSnapHints)
  const panels = useDesignStore((s) => s.panels)
  const tool = useDesignStore((s) => s.tool)
  const color = useDesignStore((s) => findMaterial(s.materials, panel.materialId).color)

  const hidden = panel.hidden === true
  const selected = selectedIds.includes(panel.id)
  // The last-selected panel carries the move gizmo for the whole group.
  const isPrimary = selectedIds[selectedIds.length - 1] === panel.id

  // Positions of every selected panel frozen at pointer-down, so the whole
  // group moves rigidly by the primary's displacement.
  const groupStart = useRef<{ id: string; position: Vec3 }[]>([])
  // Which single axis the gizmo is dragging (null for a plane drag), and whether
  // a readout gesture has been opened this drag.
  const axisRef = useRef<0 | 1 | 2 | null>(null)
  const gestureOpen = useRef(false)

  const size = toMetres(panelBoxSize(panel))
  const position = toMetres(panel.position)

  const selectedNow = () => panels.filter((p) => selectedIds.includes(p.id))

  // Apply a rigid delta to the frozen group, live (no autosave).
  const applyGroupDelta = (start: { id: string; position: Vec3 }[], d: Vec3) => {
    movePanelsLive(
      start.map((s) => ({ id: s.id, position: [s.position[0] + d[0], s.position[1] + d[1], s.position[2] + d[2]] })),
    )
  }

  // Read fresh store state (not a render/closure snapshot) so a deferred commit
  // from the readout box uses the latest live positions, not the drag's first
  // frame.
  const commitMoved = () => {
    const s = useDesignStore.getState()
    commitPanelsMove(
      s.panels
        .filter((p) => s.selectedIds.includes(p.id))
        .map((p) => ({ id: p.id, position: p.position.map(Math.round) as Vec3 })),
    )
  }

  // Open the corner readout for a single-axis drag: its apply/commit/cancel all
  // work from the frozen origin captured at pointer-down.
  const openGesture = (axis: 0 | 1 | 2, origin: { id: string; position: Vec3 }[]) => {
    startGesture({
      kind: 'move',
      label: AXIS_NAME[axis],
      delta: 0,
      editable: false,
      apply: (mm) => {
        const d: Vec3 = [0, 0, 0]
        d[axis] = mm
        applyGroupDelta(origin, d)
      },
      commit: () => {
        commitMoved()
        clearGesture()
      },
      cancel: () => {
        restorePanels(origin.map((o) => ({ id: o.id, patch: { position: o.position } })))
        clearGesture()
      },
    })
  }

  const beginDrag = () => {
    groupStart.current = selectedNow().map((p) => ({ id: p.id, position: p.position }))
    axisRef.current = null
    gestureOpen.current = false
  }

  // Drag: the gizmo moves the primary by a raw delta; snapGroupDelta lands any
  // group member on a neighbour edge. On a single-axis drag we lock the snap
  // (and motion) to that axis and stream the delta into the corner readout.
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
    axisRef.current = singleAxis(raw)

    const byId = new Map(panels.map((p) => [p.id, p]))
    const proposed = start.map((s) => ({
      panel: byId.get(s.id)!,
      position: [s.position[0] + raw[0], s.position[1] + raw[1], s.position[2] + raw[2]] as Vec3,
    }))
    const others = panels.filter((p) => !selectedIds.includes(p.id))
    const { correction: corr, snaps } = snapGroupDelta(proposed, others, SNAP_THRESHOLD_MM)
    const active = axisRef.current
    // A snap counts only on axes the drag is actually moving: the locked axis
    // for a single-axis gizmo drag, or (for a plane drag) any axis that has
    // travelled a real distance. Without the movement gate a stationary axis
    // that merely happens to sit within threshold would snap "out of nowhere".
    const applies = (a: 0 | 1 | 2) =>
      active === a || (active === null && Math.abs(raw[a]) > MOVE_THRESHOLD_MM)
    const delta: Vec3 = [0, 1, 2].map((a) => raw[a] + (applies(a as 0 | 1 | 2) ? corr[a] : 0)) as Vec3

    obj.position.set(
      (primaryStart[0] + delta[0]) * MM_TO_M,
      (primaryStart[1] + delta[1]) * MM_TO_M,
      (primaryStart[2] + delta[2]) * MM_TO_M,
    )
    applyGroupDelta(start, delta)

    // Surface a marker for each axis that actually snapped, positioned on the
    // primary panel's snapped centre so the guide sits where the eye is.
    const centre: Vec3 = [primaryStart[0] + delta[0], primaryStart[1] + delta[1], primaryStart[2] + delta[2]]
    const boxSize = panelBoxSize(panel)
    setSnapHints(
      ([0, 1, 2] as const).flatMap((a) => {
        const snap = snaps[a]
        if (!snap || !applies(a)) return []
        // One guide per coincident target, so a flush fit shows both faces —
        // only the first is labelled so the words don't stack.
        return snap.hits.map((h, i) => {
          const at: Vec3 = [...centre]
          at[a] = h.plane
          return { axis: a, kind: h.kind, at, size: boxSize, label: i === 0 }
        })
      }),
    )

    // Live readout for single-axis drags only (a plane drag has no one number).
    if (active !== null) {
      if (!gestureOpen.current) {
        openGesture(active, start.map((s) => ({ id: s.id, position: s.position })))
        gestureOpen.current = true
      }
      setGestureDelta(delta[active])
    }
  }

  // Drag released: a single-axis drag leaves the readout open to type into
  // (commit deferred); a plane drag commits at once; a negligible nudge is a
  // click and changes nothing.
  const endDrag = () => {
    setSnapHints([]) // the guides belong to the live drag only
    const start = groupStart.current
    if (start.length === 0) return
    const primaryStart = start.find((s) => s.id === panel.id)?.position ?? panel.position
    const primaryNow = panels.find((p) => p.id === panel.id)?.position ?? primaryStart
    const moved = Math.hypot(
      primaryNow[0] - primaryStart[0],
      primaryNow[1] - primaryStart[1],
      primaryNow[2] - primaryStart[2],
    )
    if (moved < MOVE_THRESHOLD_MM) {
      clearGesture()
      restorePanels(start.map((s) => ({ id: s.id, patch: { position: s.position } }))) // undo the sub-mm nudge
      return
    }
    armSelectSuppression() // the drag-release click mustn't reselect a panel
    if (axisRef.current === null) {
      commitMoved()
      clearGesture()
    } else {
      setGestureEditable() // keep the readout open, now typeable
    }
  }

  return (
    <>
      <mesh
        ref={meshRef}
        position={position}
        // A hidden panel is a ghost: it stays on screen (so it still reads as
        // part of the model and can guide snapping) but ignores the ray, so it
        // can't be clicked or dragged.
        raycast={hidden ? NULL_RAYCAST : DEFAULT_RAYCAST}
        onClick={
          hidden
            ? undefined
            : (e) => {
                e.stopPropagation()
                sceneSelect(panel.id, e.nativeEvent.shiftKey)
              }
        }
      >
        <boxGeometry args={size} />
        {/* A hidden panel is a faint light-grey ghost: a barely-there transparent
            fill so its shape still reads, but you can see straight through it.
            The `key` forces a fresh material when visibility flips — toggling
            `transparent` on an existing material doesn't reliably take, leaving
            it rendering opaque. */}
        <meshStandardMaterial
          key={hidden ? 'ghost' : 'solid'}
          color={hidden ? '#c9ced7' : color}
          transparent={hidden}
          opacity={hidden ? 0.2 : 1}
          depthWrite={!hidden}
          emissive={selected ? '#2a6cff' : '#000000'}
          emissiveIntensity={selected ? 0.35 : 0}
        />
        <Edges threshold={15} color={selected ? '#2a6cff' : hidden ? '#6a7180' : '#5a4a32'} />
      </mesh>

      {!hidden && selected && isPrimary && tool === 'move' && (
        <TransformControls
          object={meshRef}
          mode="translate"
          onMouseDown={beginDrag}
          onObjectChange={dragGroup}
          onMouseUp={endDrag}
        />
      )}

      {!hidden && selected && selectedIds.length === 1 && tool === 'resize' && <ResizeHandles panel={panel} />}
    </>
  )
}
