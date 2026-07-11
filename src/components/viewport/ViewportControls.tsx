import { useEffect, useRef, useState } from 'react'
import { useDesignStore } from '../../store/designStore'

/** Below this drag distance (px) a gesture is a click, not a marquee. */
const DRAG_THRESHOLD_PX = 4

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Viewport corner control + rubber-band box select. Rendered as a DOM sibling
 * of the Canvas (never inside it — R3F's reconciler can't host plain DOM).
 *
 * The segmented toggle switches the left-drag behaviour between orbiting the
 * camera and dragging a selection box. In select mode it listens on the canvas
 * element, draws the marquee, and on release hands the rectangle to the store
 * for the in-canvas picker to resolve into a selection (Shift extends it).
 */
export function ViewportControls() {
  const dragMode = useDesignStore((s) => s.dragMode)
  const setDragMode = useDesignStore((s) => s.setDragMode)
  const setMarqueeBox = useDesignStore((s) => s.setMarqueeBox)

  const rootRef = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; additive: boolean } | null>(null)
  const box = useRef<Rect | null>(null)
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    if (dragMode !== 'select') return
    const canvas = rootRef.current?.parentElement?.querySelector('canvas')
    if (!canvas) return

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const p = local(e)
      start.current = { x: p.x, y: p.y, additive: e.shiftKey }
    }
    const onMove = (e: PointerEvent) => {
      if (!start.current) return
      const p = local(e)
      const next: Rect = {
        x: Math.min(start.current.x, p.x),
        y: Math.min(start.current.y, p.y),
        w: Math.abs(p.x - start.current.x),
        h: Math.abs(p.y - start.current.y),
      }
      if (next.w >= DRAG_THRESHOLD_PX || next.h >= DRAG_THRESHOLD_PX) {
        box.current = next
        setRect(next)
      }
    }
    const onUp = () => {
      const s = start.current
      const b = box.current
      start.current = null
      box.current = null
      setRect(null)
      // Only a real drag selects; a click falls through to normal handlers.
      if (s && b) setMarqueeBox({ ...b, additive: s.additive })
    }

    canvas.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dragMode, setMarqueeBox])

  return (
    <div ref={rootRef} className="viewport-controls">
      <div className="viewport-mode" role="group" aria-label="Left-drag mode">
        <button
          className={dragMode === 'orbit' ? 'is-active' : ''}
          onClick={() => setDragMode('orbit')}
          title="Rotate — left-drag orbits the camera"
          aria-label="Rotate mode"
        >
          <RotateIcon />
        </button>
        <button
          className={dragMode === 'select' ? 'is-active' : ''}
          onClick={() => setDragMode('select')}
          title="Select — left-drag boxes panels (Shift adds)"
          aria-label="Box select mode"
        >
          <SelectIcon />
        </button>
      </div>

      {rect && (
        <div
          className="viewport-marquee"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        />
      )}
    </div>
  )
}

function RotateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 4v4h-4" />
    </svg>
  )
}

function SelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3">
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  )
}
