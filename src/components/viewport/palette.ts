/**
 * The 3D scene's colours, read from the same stylesheet as the rest of the UI.
 *
 * three.js materials take colour strings rather than class names, so the
 * viewport can't use Tailwind utilities. It used to keep its own hardcoded
 * copies of the palette, which silently drifted the moment the accent changed —
 * snap guides and the selection highlight ended up a different blue from every
 * other accent in the app. Reading the custom properties back out keeps
 * `theme.css` the single source of truth.
 *
 * Resolved once on first use, not at module load: in development Vite injects
 * the stylesheet from JavaScript, so the variables may not exist yet when this
 * module is evaluated. Every caller runs during render, long after that.
 */

const FALLBACK = '#ff00ff' // unmissable if a token is ever renamed out from under us

function read(token: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value || FALLBACK
}

export interface ViewportPalette {
  /** Selection highlight, measurement line, and the `butt` snap guide. */
  accent: string
  snapButt: string
  snapMiddle: string
  /** Resize face tint and grab handles. */
  resize: string
  resizeHover: string
  /** The edge a hovered / focused size field changes. */
  fieldHighlight: string
  /** Interpenetration markers. */
  overlap: string
  /** Canvas background and floor grid. */
  scene: string
  grid: string
  gridMajor: string
  /** Panel outlines, and the ghosted look of a hidden panel. */
  panelEdge: string
  ghost: string
  ghostEdge: string
  /** Pickable corner dots: idle, and lit under the pointer. */
  corner: string
  cornerActive: string
  /** No emissive contribution — three.js wants a colour, not a null. */
  none: string
}

let cached: ViewportPalette | null = null

export function palette(): ViewportPalette {
  cached ??= {
    accent: read('--color-accent'),
    snapButt: read('--color-snap-butt'),
    snapMiddle: read('--color-snap-middle'),
    resize: read('--color-resize'),
    resizeHover: read('--color-resize-hover'),
    fieldHighlight: read('--color-field-highlight'),
    overlap: read('--color-overlap'),
    scene: read('--color-scene'),
    grid: read('--color-scene-grid'),
    gridMajor: read('--color-scene-grid-major'),
    panelEdge: read('--color-panel-edge'),
    ghost: read('--color-ghost'),
    ghostEdge: read('--color-ghost-edge'),
    corner: read('--color-corner'),
    cornerActive: '#ffffff',
    none: '#000000',
  }
  return cached
}
