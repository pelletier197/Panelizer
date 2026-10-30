import { Kbd } from '../ui/Kbd'
import { KEYS } from '../ui/keys'

/**
 * A faint reminder in the viewport corner of the two drag modifiers people
 * can't discover by clicking around — Shift boxes a selection, Ctrl (⌘ on a
 * Mac) pans — and where the rest of the shortcuts live. Never in the way: it
 * ignores the pointer, and it hides while printing.
 */
export function ViewportHint() {
  return (
    <p className="text-micro pointer-events-none absolute top-3 left-3 m-0 flex items-center gap-1 text-ink-faint select-none print:hidden">
      <Kbd keys="Shift" inline /> drag to select
      <span className="mx-1">·</span>
      <Kbd keys="Ctrl" inline /> drag to pan
      <span className="mx-1">·</span>
      <Kbd keys={KEYS.help} inline /> all shortcuts
    </p>
  )
}
