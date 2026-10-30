import type { ReactNode } from 'react'
import { useDesignStore } from '../../store/designStore'
import { Kbd } from '../ui/Kbd'
import { KEYS } from '../ui/keys'

/** A short separator between hint phrases. */
const Dot = () => <span className="mx-1">·</span>

/** The next step of the active tool, or null for tools that need no guidance
 *  (free move is just "drag the arrows"). */
function toolStep(tool: string, picking: boolean): ReactNode {
  switch (tool) {
    case 'move-snap':
      return picking ? 'Now click the corner to move it onto' : 'Click a corner to grab'
    case 'measure':
      return picking ? 'Click the other corner to measure' : 'Click the first corner'
    case 'resize':
      return (
        <>
          Drag a face to resize
          <Dot />
          <Kbd keys="Alt" inline /> both sides
        </>
      )
    default:
      return null
  }
}

/**
 * One faint row of guidance in the viewport corner, never in the way (it
 * ignores the pointer and hides when printing):
 *
 * - first, the active tool's next step when the tool needs one — brighter,
 *   since it's what to do right now;
 * - then the drag modifiers people can't discover by clicking around — Shift
 *   boxes a selection, Ctrl (⌘ on a Mac) pans — and where the other shortcuts
 *   are.
 */
export function ViewportHint() {
  const tool = useDesignStore((s) => s.tool)
  const picking = useDesignStore((s) => s.toolPick !== null)
  const step = toolStep(tool, picking)

  return (
    <p className="text-micro pointer-events-none absolute top-3 left-3 m-0 flex flex-wrap items-center gap-1 text-ink-faint select-none print:hidden">
      {step && (
        <>
          <span className="flex items-center gap-1 font-medium text-ink">{step}</span>
          <Dot />
        </>
      )}
      <Kbd keys="Shift" inline /> drag to select
      <Dot />
      <Kbd keys="Ctrl" inline /> drag to pan
      <Dot />
      <Kbd keys={KEYS.help} inline /> all shortcuts
    </p>
  )
}
