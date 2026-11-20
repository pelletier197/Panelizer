import type { Panel } from '../../types/panel'

/** Set by the mounted <CameraFramer />; `frameView` calls through it. */
let frame: (panels: Panel[]) => void = () => {}

/** Wire the framer in. Called by <CameraFramer /> only; returns the unwire. */
export function registerFramer(fn: (panels: Panel[]) => void) {
  frame = fn
  return () => {
    if (frame === fn) frame = () => {}
  }
}

/**
 * Point the camera at `panels` so they fill the viewport, keeping the current
 * viewing angle. Callable from outside the Canvas (the keymap); a no-op until
 * the viewport has mounted, or when given no panels.
 */
export function frameView(panels: Panel[]) {
  frame(panels)
}

/** Set by the mounted <CameraFramer />: the main camera's viewing direction. */
let direction: () => [number, number, number] | null = () => null

/** Wire the direction reader in. Called by <CameraFramer /> only; returns the
 *  unwire. */
export function registerViewDirection(fn: () => [number, number, number] | null) {
  direction = fn
  return () => {
    if (direction === fn) direction = () => null
  }
}

/**
 * Which way the main viewport is looking from, as a unit vector from the orbit
 * target out to the camera — so another view (the joint close-up) can open
 * from the same side. Null until the viewport has mounted.
 */
export function viewDirection(): [number, number, number] | null {
  return direction()
}
