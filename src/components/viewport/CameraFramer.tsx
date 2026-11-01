import { useEffect } from 'react'
import { PerspectiveCamera, Vector3 } from 'three'
import { useThree } from '@react-three/fiber'
import type { Panel } from '../../types/panel'
import { MM_TO_M } from '../../lib/geometry'
import { frameBounds, unionBounds } from '../../lib/framing'
import { useDesignStore } from '../../store/designStore'
import { frameView, registerFramer } from './frameView'

/** How long the camera glides to its framed view (ms). */
const GLIDE_MS = 250

/**
 * Owns camera framing inside the Canvas, where the camera and orbit controls
 * live, and serves `frameView` for the keymap. Moves both the orbit target and the camera, gliding between the two
 * views rather than jumping so the change of view is easy to follow. Renders
 * nothing.
 *
 * Also frames each project as it opens — at startup, and on switching,
 * importing or following a link — so a design never opens off-screen at
 * whatever angle the last one was left.
 */
export function CameraFramer() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    let raf = 0
    const unregister = registerFramer((panels: Panel[]) => {
      const bounds = unionBounds(panels)
      if (!bounds || !controls || !(camera instanceof PerspectiveCamera)) return

      const dir = camera.position.clone().sub(controls.target).normalize()
      const goal = frameBounds(bounds, [dir.x, dir.y, dir.z], camera.fov, camera.aspect)

      const fromTarget = controls.target.clone()
      const fromPos = camera.position.clone()
      const toTarget = new Vector3(...goal.target).multiplyScalar(MM_TO_M)
      const toPos = new Vector3(...goal.position).multiplyScalar(MM_TO_M)

      cancelAnimationFrame(raf)
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / GLIDE_MS)
        const ease = 1 - (1 - t) ** 3
        controls.target.lerpVectors(fromTarget, toTarget, ease)
        camera.position.lerpVectors(fromPos, toPos, ease)
        controls.update()
        invalidate()
        if (t < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    })
    return () => {
      cancelAnimationFrame(raf)
      unregister()
    }
  }, [camera, controls, invalidate])

  const projectId = useDesignStore((s) => s.projectId)
  useEffect(() => {
    if (controls) frameView(useDesignStore.getState().panels)
  }, [projectId, controls])

  return null
}
