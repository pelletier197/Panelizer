import { memo, useEffect, useMemo, useRef } from 'react'
import { Mesh } from 'three'
import { Edges, TransformControls } from '@react-three/drei'
import type { Panel } from '../../types/panel'
import { MM_TO_M, toMetres } from '../../lib/geometry'
import { findMaterial } from '../../lib/materials'
import { roundToUnitGrid } from '../../lib/units'
import { SNAP_THRESHOLD_MM, snapGroupDelta, snapHintFromTarget } from '../../lib/snapping'
import { useDesignStore } from '../../store/designStore'
import { ResizeHandles } from './ResizeHandles'
import { palette } from './palette'
import { panelGeometry } from './panelGeometry'
import { lookOf } from './finishLook'
import { usePhotos } from './photos'
import { useGesture, type GestureSpec } from './useGesture'
import { useCompact } from '../../hooks/useMedia'

type Vec3 = [number, number, number]

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
export const PanelMesh = memo(function PanelMesh({ panel }: { panel: Panel }) {
  const meshRef = useRef<Mesh>(null!)
  // Narrow subscriptions on purpose: every drag frame replaces `panels`, and
  // subscribing to the whole list or selection would re-render every mesh in
  // the scene each frame. Handlers read the full state at event time instead.
  const selected = useDesignStore((s) => s.selectedIds.includes(panel.id))
  // The last-selected panel carries the move gizmo for the whole group.
  const isPrimary = useDesignStore((s) => s.selectedIds[s.selectedIds.length - 1] === panel.id)
  // Caught by the box-select being dragged — a lighter version of the selected look.
  // Also lit while its row is hovered in the parts list, to show which piece
  // a row is.
  const previewed = useDesignStore((s) => s.boxPreview.includes(panel.id) || s.hoverIds.includes(panel.id))
  // Shift means box-select; the gizmo stands aside so it can't grab the press.
  const boxKeyHeld = useDesignStore((s) => s.boxKeyHeld)
  const sceneSelect = useDesignStore((s) => s.sceneSelect)
  const movePanelsLive = useDesignStore((s) => s.movePanelsLive)
  const commitPanelsMove = useDesignStore((s) => s.commitPanelsMove)
  const restorePanels = useDesignStore((s) => s.restorePanels)
  const clearGesture = useDesignStore((s) => s.clearGesture)
  const setSnapHints = useDesignStore((s) => s.setSnapHints)
  const tool = useDesignStore((s) => s.tool)
  const unit = useDesignStore((s) => s.unit)
  const precision = useDesignStore((s) => s.precision)
  const material = useDesignStore((s) => findMaterial(s.materials, panel.materialId))
  usePhotos() // re-render when the finish's photo arrives
  const look = lookOf(material)

  const paint = palette()
  const gesture = useGesture()
  // On a phone the model is for looking at and measuring: a finger meant to
  // orbit would too easily grab a gizmo and move the part instead.
  const compact = useCompact()
  const hidden = panel.hidden === true

  // Positions of every selected panel frozen at pointer-down, so the whole
  // group moves rigidly by the primary's displacement.
  const groupStart = useRef<{ id: string; position: Vec3 }[]>([])
  // Which single axis the gizmo is dragging (null for a plane drag), and whether
  // a readout gesture has been opened this drag.
  const axisRef = useRef<0 | 1 | 2 | null>(null)

  // Rounded corners need a real outline; square panels keep the plain box.
  // Rebuilt only when the shape or grain changes — not on every move, which
  // only changes the position.
  const { id, length, width, thickness, normal, grain } = panel
  const cornersKey = panel.corners?.join(',') ?? ''
  const geometry = useMemo(
    () =>
      panelGeometry({
        id,
        length,
        width,
        thickness,
        normal,
        grain,
        corners: cornersKey ? (cornersKey.split(',').map(Number) as Panel['corners']) : undefined,
      }),
    [id, length, width, thickness, normal, grain, cornersKey],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  const position = toMetres(panel.position)

  const selectedNow = () => {
    const { panels, selectedIds } = useDesignStore.getState()
    return panels.filter((p) => selectedIds.includes(p.id))
  }

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
    // Commit the exact live positions — no re-quantizing. Snapping already
    // landed panels on precise contact planes; rounding each coordinate
    // independently would nudge snapped joints apart (small gaps that add up).
    commitPanelsMove(
      s.panels.filter((p) => s.selectedIds.includes(p.id)).map((p) => ({ id: p.id, position: p.position })),
    )
  }

  // What the corner readout does for a single-axis drag: apply/commit/cancel all
  // work from the frozen origin captured at pointer-down.
  const moveGesture = (axis: 0 | 1 | 2, origin: { id: string; position: Vec3 }[]): GestureSpec => ({
    kind: 'move',
    label: AXIS_NAME[axis],
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

  const beginDrag = () => {
    groupStart.current = selectedNow().map((p) => ({ id: p.id, position: p.position }))
    axisRef.current = null
    gesture.begin()
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

    const { panels, selectedIds } = useDesignStore.getState()
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
    // On each moving axis: land on a neighbour if one is in range, otherwise step
    // the panel by the precision grid so a free move lands on clean increments.
    const delta: Vec3 = ([0, 1, 2] as const).map((a) => {
      if (!applies(a)) return raw[a]
      if (snaps[a]) return raw[a] + corr[a]
      return roundToUnitGrid(primaryStart[a] + raw[a], unit, precision) - primaryStart[a]
    }) as Vec3

    obj.position.set(
      (primaryStart[0] + delta[0]) * MM_TO_M,
      (primaryStart[1] + delta[1]) * MM_TO_M,
      (primaryStart[2] + delta[2]) * MM_TO_M,
    )
    applyGroupDelta(start, delta)

    // Surface a marker for each axis that actually snapped. Each guide is drawn
    // on the contact rectangle (the overlap of the two panels), not the whole
    // face, so a partial or near-miss joint reads clearly.
    setSnapHints(
      ([0, 1, 2] as const).flatMap((a) => {
        const snap = snaps[a]
        if (!snap || !applies(a)) return []
        // One guide per coincident target, so a flush fit shows both faces —
        // only the first is labelled so the words don't stack.
        return snap.hits.map((hit, i) => snapHintFromTarget(a, hit, i === 0))
      }),
    )

    // Live readout for single-axis drags only (a plane drag has no one number).
    if (active !== null) {
      gesture.track(delta[active], () =>
        moveGesture(active, start.map((s) => ({ id: s.id, position: s.position }))),
      )
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
    const primaryNow = useDesignStore.getState().panels.find((p) => p.id === panel.id)?.position ?? primaryStart
    const moved = Math.hypot(
      primaryNow[0] - primaryStart[0],
      primaryNow[1] - primaryStart[1],
      primaryNow[2] - primaryStart[2],
    )
    if (moved < MOVE_THRESHOLD_MM) {
      gesture.dismiss()
      restorePanels(start.map((s) => ({ id: s.id, patch: { position: s.position } }))) // undo the sub-mm nudge
      return
    }
    if (axisRef.current === null) {
      // A plane drag has no single number to type, so it commits on release.
      gesture.suppressNextSelect()
      commitMoved()
      gesture.dismiss()
    } else {
      gesture.keepForTyping()
    }
  }

  return (
    <>
      <mesh
        ref={meshRef}
        position={position}
        // Tag so the corner-pick tool can tell a panel apart from a corner dot
        // when testing whether a corner is occluded by a panel in front.
        userData={{ isPanel: true }}
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
        <primitive object={geometry} attach="geometry" />
        {/* A hidden panel is a faint light-grey ghost: a barely-there transparent
            fill so its shape still reads, but you can see straight through it.
            The `key` forces a fresh material when visibility flips — toggling
            `transparent` on an existing material doesn't reliably take, leaving
            it rendering opaque — or when a texture comes or goes, which needs
            its shader rebuilt. */}
        <meshStandardMaterial
          key={hidden ? 'ghost' : `${look.map?.uuid ?? 'flat'}:${look.normalMap?.uuid ?? ''}`}
          color={hidden ? paint.ghost : look.color}
          map={hidden ? null : look.map}
          normalMap={hidden ? null : look.normalMap}
          normalScale={look.normalScale}
          roughness={look.roughness}
          metalness={hidden ? 0 : look.metalness}
          transparent={hidden}
          opacity={hidden ? 0.2 : 1}
          depthWrite={!hidden}
          emissive={selected || previewed ? paint.accent : paint.none}
          emissiveIntensity={selected ? 0.35 : previewed ? 0.2 : 0}
        />
        <Edges
          threshold={15}
          color={selected || previewed ? paint.accent : hidden ? paint.ghostEdge : paint.panelEdge}
        />
      </mesh>

      {!hidden && selected && isPrimary && tool === 'move' && !compact && (
        <TransformControls
          object={meshRef}
          mode="translate"
          enabled={!boxKeyHeld}
          onMouseDown={beginDrag}
          onObjectChange={dragGroup}
          onMouseUp={endDrag}
        />
      )}

      {/* Like the move gizmo, the primary carries the resize handles for the
          whole selection. */}
      {!hidden && selected && isPrimary && tool === 'resize' && !compact && <ResizeHandles panel={panel} />}
    </>
  )
})
