import { useEffect } from 'react'
import { Vector3 } from 'three'
import { useThree } from '@react-three/fiber'
import { MM_TO_M } from '../../lib/geometry'
import { panelsInRect, rectFromDrag, ruleForDrag } from '../../lib/marquee'
import { useDesignStore, type BoxSelectOp } from '../../store/designStore'

/** Below this drag distance (px) a Shift-press is a Shift+click, not a box. */
const DRAG_THRESHOLD_PX = 4

/**
 * Shift+drag box selection. No mode to switch into: a plain drag still orbits,
 * Shift+drag draws a box that adds what it catches to the selection, and
 * Ctrl/Cmd+Shift+drag removes it. Dragging left → right catches panels fully
 * inside the box (solid outline); right → left catches anything it touches
 * (dashed outline). The panels it would catch light up as the box moves.
 *
 * Lives inside the Canvas for the live camera, and listens on the canvas
 * element in the capture phase so it sees the press before OrbitControls —
 * which would otherwise take Shift+drag as a pan — and can switch it off for
 * the drag. The rectangle itself is a plain DOM node beside the canvas, moved
 * imperatively: it changes every pointer frame and has no business going
 * through React state. Renders nothing into the scene.
 *
 * Shift+press always means "box", wherever it lands: while Shift is held the
 * move gizmo is switched off (via `boxKeyHeld`) and the resize handles ignore
 * the press. So the box never has to guess whether some other drag started
 * under it — an earlier version watched the store's pending-drag state for
 * that, and any gesture that left the state unexpected silently blocked every
 * box afterwards.
 */
export function BoxSelect() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null

  useEffect(() => {
    const canvas = gl.domElement
    const host = canvas.parentElement
    if (!host) return

    const outline = document.createElement('div')
    outline.className = 'pointer-events-none absolute hidden border border-accent bg-accent/15'
    host.appendChild(outline)

    const v = new Vector3()
    let drag: { x: number; y: number; op: BoxSelectOp; open: boolean } | null = null

    const local = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }

    // World mm → canvas px, or null for a point behind the camera.
    const project = ([x, y, z]: [number, number, number]): [number, number] | null => {
      v.set(x * MM_TO_M, y * MM_TO_M, z * MM_TO_M).project(camera)
      if (v.z > 1) return null
      return [(v.x * 0.5 + 0.5) * canvas.clientWidth, (-v.y * 0.5 + 0.5) * canvas.clientHeight]
    }

    const end = () => {
      drag = null
      outline.classList.add('hidden')
      useDesignStore.getState().setBoxPreview([])
      if (controls) controls.enabled = useDesignStore.getState().orbitEnabled
    }

    const onDown = (e: PointerEvent) => {
      // A box whose release never arrived (let go outside the window) ends here.
      if (drag) end()
      if (e.button !== 0 || !e.shiftKey) return
      const [x, y] = local(e)
      drag = { x, y, op: e.ctrlKey || e.metaKey ? 'remove' : 'add', open: false }
      if (controls) controls.enabled = false
    }

    const onMove = (e: PointerEvent) => {
      if (!drag) return
      const store = useDesignStore.getState()
      const here = local(e)
      const rect = rectFromDrag([drag.x, drag.y], here)
      if (!drag.open && rect.w < DRAG_THRESHOLD_PX && rect.h < DRAG_THRESHOLD_PX) return
      drag.open = true

      const rule = ruleForDrag(drag.x, here[0])
      outline.classList.remove('hidden')
      outline.classList.toggle('border-dashed', rule === 'touch')
      Object.assign(outline.style, {
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.w}px`,
        height: `${rect.h}px`,
      })
      store.setBoxPreview(panelsInRect(store.panels, project, rect, rule))
    }

    const onUp = () => {
      if (!drag) return
      if (drag.open) {
        const store = useDesignStore.getState()
        store.selectInBox(store.boxPreview, drag.op)
        // The browser still fires a click after the drag; if it lands on a
        // panel, Shift+click would toggle it straight back out.
        store.armSelectSuppression()
      }
      end()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') useDesignStore.getState().setBoxKeyHeld(true)
      if (e.key === 'Escape' && drag?.open) {
        e.stopPropagation() // cancel the box, not the selection
        end()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') useDesignStore.getState().setBoxKeyHeld(false)
    }
    // Switching away mid-gesture loses the keyup and pointerup.
    const onBlur = () => {
      useDesignStore.getState().setBoxKeyHeld(false)
      if (drag) end()
    }

    canvas.addEventListener('pointerdown', onDown, { capture: true })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      canvas.removeEventListener('pointerdown', onDown, { capture: true })
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      outline.remove()
    }
  }, [camera, gl, controls])

  return null
}
