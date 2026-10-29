import { useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import type { Panel } from '../../types/panel'
import { MM_TO_M, axisField, panelBoxSize, toMetres } from '../../lib/geometry'
import { roundToUnitGrid } from '../../lib/units'
import { resizeGroup, resizeRestore } from '../../lib/resize'
import { SNAP_THRESHOLD_MM, snapHintFromTarget, snapResizeFace, type SnapHitTarget } from '../../lib/snapping'
import { useDesignStore } from '../../store/designStore'
import { palette } from './palette'
import { useGesture, type GestureSpec } from './useGesture'

type Axis3 = 0 | 1 | 2
type FaceSign = 1 | -1

/** A gesture moving the face less than this (mm) is a click, not a drag — no
 *  resize is committed. */
const CLICK_THRESHOLD_MM = 0.5
/** How far (mm) the grab handle floats outside its face. */
const HANDLE_OFFSET_MM = 40
const HANDLE_RADIUS_M = 0.009 // visible ball
const HIT_RADIUS_M = 0.022 // slightly larger invisible grab target

function faceCenterMm(panel: Panel, axis: Axis3, faceSign: FaceSign): [number, number, number] {
  const half = panelBoxSize(panel)[axis] / 2
  const center: [number, number, number] = [...panel.position]
  center[axis] += faceSign * half
  return center
}

/** What we freeze at pointer-down so every move is computed against an
 *  immutable starting state — this is what stops the resize from feeding back
 *  into itself as the face (and thus the handle) moves during the drag. */
interface DragStart {
  panel: Panel
  /** Every selected panel this face can resize (the handle's own panel
   *  included), frozen at pointer-down. A single selection is a group of one. */
  group: Panel[]
  /** Unselected panels the moving face can snap onto, frozen at pointer-down. */
  others: Panel[]
  /** A fixed point on the drag-axis line, frozen at pointer-down. Frozen (not
   *  recomputed from the live panel) so the resize can't feed back on itself
   *  as the face moves during the drag. */
  p0: Vector3
  param0: number // pointer's position along the drag axis at pointer-down (m)
}

/**
 * One grab handle floating off a resizable face. Drag it along the face
 * normal to resize that dimension with the opposite face held fixed
 * (Alt = symmetric, both faces move and the centre stays put). With several
 * panels selected the same face displacement applies to each of them along the
 * same world axis and side — each holding its own opposite face — and panels
 * whose thickness runs along that axis are left alone.
 *
 * OrbitControls listens on the canvas element directly, so `stopPropagation`
 * can't keep it from also handling the drag — instead we disable it while the
 * pointer is over a handle and restore it when the pointer leaves.
 */
function FaceHandle({ panel, axis, faceSign }: { panel: Panel; axis: Axis3; faceSign: FaceSign }) {
  const patchPanelsLive = useDesignStore((s) => s.patchPanelsLive)
  const commitPanelPatches = useDesignStore((s) => s.commitPanelPatches)
  const restorePanels = useDesignStore((s) => s.restorePanels)
  const setOrbit = useDesignStore((s) => s.setOrbitEnabled)
  const clearGesture = useDesignStore((s) => s.clearGesture)
  const setSnapHints = useDesignStore((s) => s.setSnapHints)
  const unit = useDesignStore((s) => s.unit)
  const precision = useDesignStore((s) => s.precision)
  const invalidate = useThree((s) => s.invalidate)

  const drag = useRef<DragStart | null>(null)
  const lastDelta = useRef(0)
  const [hovered, setHovered] = useState(false)
  const paint = palette()
  const gesture = useGesture()

  // Safety net: if this handle unmounts mid-gesture (tool switch, deselect),
  // make sure orbit is turned back on and no snap guide is left hanging.
  useEffect(
    () => () => {
      setOrbit(true)
      setSnapHints([])
    },
    [setOrbit, setSnapHints],
  )

  const faceCenter = faceCenterMm(panel, axis, faceSign)
  const handleCenter: [number, number, number] = [...faceCenter]
  handleCenter[axis] += faceSign * HANDLE_OFFSET_MM

  // Faint slab marking the whole face (visual only — never a click target).
  const box = panelBoxSize(panel)
  const slabSize = toMetres(box.map((v, i) => (i === axis ? 6 : v)) as [number, number, number])

  // Position (m) of the pointer ray projected onto this face's drag axis: the
  // closest point between the axis line (through the frozen point `p0`, along
  // `axis`) and the mouse ray. Camera-independent, so it works from any angle.
  const axisParam = (ray: ThreeEvent<PointerEvent>['ray'], p0: Vector3): number => {
    const u = new Vector3(); u.setComponent(axis, 1)
    const w0 = p0.clone().sub(ray.origin)
    const b = u.dot(ray.direction)
    const denom = 1 - b * b
    if (Math.abs(denom) < 1e-6) return u.dot(w0) // ray parallel to axis: no motion
    return (b * ray.direction.dot(w0) - u.dot(w0)) / denom
  }

  // Raw pointer displacement (mm) since pointer-down, then magnetically snapped
  // so the moving face clicks onto a nearby neighbour edge or centre line.
  const faceSnap = (ray: ThreeEvent<PointerEvent>['ray']) => {
    if (!drag.current) return { delta: 0, snap: null }
    const raw = (axisParam(ray, drag.current.p0) - drag.current.param0) / MM_TO_M
    return snapResizeFace(drag.current.panel, axis, faceSign, raw, drag.current.others, SNAP_THRESHOLD_MM)
  }

  // Show (or clear) the snap guide, drawn on the contact rectangle (the overlap
  // of the two panels) so it marks only where the faces meet.
  const showSnap = (snap: SnapHitTarget | null) => {
    setSnapHints(snap ? [snapHintFromTarget(axis, snap)] : [])
  }

  const label = axisField(panel.normal, axis) === 'length' ? 'Length' : 'Width'

  // Resize the frozen start group by the given axis displacement (mm). On
  // commit each size lands on the unit grid so the part reads (and stores) as
  // an exact fraction — what you see is what's cut.
  const applyFrom = (startGroup: Panel[], deltaMm: number, symmetric: boolean, commit: boolean) => {
    if (!commit) {
      patchPanelsLive(resizeGroup(startGroup, axis, faceSign, deltaMm, symmetric))
      return
    }
    const round = (mm: number) => roundToUnitGrid(mm, unit, precision)
    commitPanelPatches(resizeGroup(startGroup, axis, faceSign, deltaMm, symmetric, round))
  }

  // What the corner readout does for this resize: apply/commit/cancel all work
  // from the frozen start group captured at pointer-down.
  const resizeGesture = (startGroup: Panel[], symmetric: boolean): GestureSpec => ({
    kind: 'resize',
    label,
    apply: (mm) => {
      lastDelta.current = mm
      applyFrom(startGroup, mm, symmetric, false)
    },
    commit: () => {
      applyFrom(startGroup, lastDelta.current, symmetric, true)
      clearGesture()
    },
    cancel: () => {
      restorePanels(resizeRestore(startGroup))
      clearGesture()
    },
  })

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    setOrbit(false)
    gesture.begin()
    const p0 = new Vector3(...toMetres(faceCenter))
    const { panels, selectedIds } = useDesignStore.getState()
    const chosen = new Set(selectedIds)
    drag.current = {
      panel,
      // Selected panels whose thickness runs along this axis can't follow.
      group: panels.filter((p) => chosen.has(p.id) && axisField(p.normal, axis) !== 'thickness'),
      // A group member is moving too, so it's no anchor to snap onto.
      others: panels.filter((p) => !chosen.has(p.id)),
      p0,
      param0: axisParam(e.ray, p0),
    }
  }

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    e.stopPropagation()
    const fs = faceSnap(e.ray)
    // Neighbour snap wins; otherwise step the SIZE by the precision grid so a
    // free resize changes the part's dimension in clean increments (1/4", …).
    // (Snapping the face position instead would leave the size off-grid whenever
    // the opposite face is.)
    let deltaMm = fs.delta
    if (!fs.snap) {
      const factor = faceSign * (e.nativeEvent.altKey ? 2 : 1)
      const startSize = panelBoxSize(drag.current.panel)[axis]
      const snappedSize = roundToUnitGrid(startSize + fs.delta * factor, unit, precision)
      deltaMm = (snappedSize - startSize) / factor
    }
    lastDelta.current = deltaMm
    const startGroup = drag.current.group
    const symmetric = e.nativeEvent.altKey
    applyFrom(startGroup, deltaMm, symmetric, false)
    gesture.track(deltaMm, () => resizeGesture(startGroup, symmetric))

    showSnap(fs.snap)
    invalidate()
  }

  // Drag released: a real resize leaves the readout open to type into (commit
  // deferred); a click (barely moved) changes nothing.
  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return
    e.stopPropagation()
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    const deltaMm = faceSnap(e.ray).delta
    drag.current = null
    setOrbit(true)
    setSnapHints([]) // the guide belongs to the live drag only
    if (Math.abs(deltaMm) >= CLICK_THRESHOLD_MM) gesture.keepForTyping()
    else gesture.dismiss()
  }

  return (
    <>
      {/* Non-interactive face tint so it's obvious which dimension a handle grows. */}
      <mesh position={toMetres(faceCenter)} raycast={() => null}>
        <boxGeometry args={slabSize} />
        <meshBasicMaterial color={paint.resize} transparent opacity={hovered ? 0.25 : 0.08} depthWrite={false} />
      </mesh>

      <group position={toMetres(handleCenter)}>
        {/* Larger invisible sphere makes the handle easy to grab. */}
        <mesh
          onPointerOver={(e) => {
            e.stopPropagation()
            setHovered(true)
            setOrbit(false)
          }}
          onPointerOut={() => {
            setHovered(false)
            if (!drag.current) setOrbit(true)
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
        >
          <sphereGeometry args={[HIT_RADIUS_M, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
        </mesh>
        {/* Visible ball (non-interactive; the hit sphere above owns pointers). */}
        <mesh raycast={() => null}>
          <sphereGeometry args={[HANDLE_RADIUS_M, 16, 16]} />
          <meshBasicMaterial color={hovered ? paint.resizeHover : paint.resize} depthTest={false} />
        </mesh>
      </group>
    </>
  )
}

/** Renders one grab handle per resizable face (the 2 thickness faces are
 *  excluded — thickness is locked everywhere in the viewport). */
export function ResizeHandles({ panel }: { panel: Panel }) {
  const axes = ([0, 1, 2] as const).filter((a) => axisField(panel.normal, a) !== 'thickness')

  return (
    <>
      {axes.flatMap((axis) =>
        ([1, -1] as const).map((faceSign) => (
          <FaceHandle key={`${axis}:${faceSign}`} panel={panel} axis={axis} faceSign={faceSign} />
        )),
      )}
    </>
  )
}
