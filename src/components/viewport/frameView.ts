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
