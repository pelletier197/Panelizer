import { useSyncExternalStore } from 'react'

/** Below Tailwind's `md` breakpoint: a phone, held either way up. The layout
 *  switches to the viewer-first mobile one. */
export const COMPACT_QUERY = '(max-width: 767px)'

/** A finger rather than a mouse: no hover, bigger targets. Independent of the
 *  width — a tablet keeps the desktop layout but is still touched. */
export const TOUCH_QUERY = '(pointer: coarse)'

/** Whether a media query matches, kept current as it changes (rotating a
 *  phone, resizing a window). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}

export const useCompact = () => useMedia(COMPACT_QUERY)
export const useTouch = () => useMedia(TOUCH_QUERY)
