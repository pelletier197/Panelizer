import { useEffect } from 'react'
import { useDesignStore, type Tool } from '../store/designStore'
import { gridStepMm } from '../lib/units'
import { useConfirm } from '../components/ui/useConfirm'

/** Whether a keystroke should be left to the focused field rather than treated
 *  as a global shortcut. */
const isTyping = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement &&
  (el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    el.isContentEditable)

/** A modal (confirm dialog, cutlist view) owns the keyboard while it's open. */
const modalOpen = (): boolean =>
  useDesignStore.getState().cutlistOpen || document.querySelector('[aria-modal="true"]') !== null

/** Number keys pick tools in toolbar order. Exported so the toolbar can show
 *  each tool's key. */
export const TOOL_SHORTCUTS: Record<Tool, string> = { move: '1', 'move-snap': '2', resize: '3', measure: '4' }
const TOOL_KEYS = Object.fromEntries(
  Object.entries(TOOL_SHORTCUTS).map(([tool, key]) => [key, tool as Tool]),
) as Record<string, Tool>

/** Arrow keys nudge along X (left/right) and Y (up/down); Alt turns up/down
 *  into Z (depth). Shift moves ten grid steps instead of one. */
const NUDGES: Record<string, { axis: 0 | 1 | 2; sign: 1 | -1 }> = {
  ArrowRight: { axis: 0, sign: 1 },
  ArrowLeft: { axis: 0, sign: -1 },
  ArrowUp: { axis: 1, sign: 1 },
  ArrowDown: { axis: 1, sign: -1 },
}

/** The keymap as shown to the user. Kept beside the handler so the cheat sheet
 *  can't drift from what the keys actually do. */
export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl+Z', action: 'Undo' },
  { keys: 'Ctrl+Y / Ctrl+Shift+Z', action: 'Redo' },
  { keys: 'Ctrl+A', action: 'Select all visible panels' },
  { keys: 'Ctrl+I', action: 'Invert selection' },
  { keys: 'Esc', action: 'Cancel the pick in progress, then deselect' },
  { keys: 'Ctrl+D', action: 'Duplicate selection' },
  { keys: 'Del / Backspace', action: 'Delete selection' },
  { keys: '← → ↑ ↓', action: 'Nudge selection on X / Y by one grid step' },
  { keys: 'Alt+↑ ↓', action: 'Nudge selection on Z' },
  { keys: 'Shift + arrows', action: 'Nudge ten grid steps' },
  { keys: '1 – 4', action: 'Move, Snap point, Resize, Measure' },
  { keys: '?', action: 'Show this list' },
]

/** Opens the keyboard-shortcut list in a dialog — from `?` or the menu. */
export function useCheatSheet() {
  const confirm = useConfirm()
  return () =>
    confirm({
      title: 'Keyboard shortcuts',
      dismissOnly: true,
      confirmLabel: 'Close',
      body: (
        <table className="w-full border-collapse">
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys} className="border-b border-edge last:border-0">
                <td className="py-1 pr-4 font-mono whitespace-nowrap text-ink">{s.keys}</td>
                <td className="py-1">{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    })
}

/**
 * Every global keyboard shortcut, in one place. Skipped while a field has focus
 * (so text edits keep their own undo and arrows) and while a modal is open.
 * Handlers read the store at key time rather than subscribing — nothing here
 * needs to re-render.
 */
export function useShortcuts() {
  const showCheatSheet = useCheatSheet()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || modalOpen()) return
      const store = useDesignStore.getState()
      const key = e.key.toLowerCase()
      const ctrl = e.ctrlKey || e.metaKey

      const handled = (() => {
        if (ctrl) {
          if (key === 'z' && !e.shiftKey) store.undo()
          else if (key === 'y' || (key === 'z' && e.shiftKey)) store.redo()
          else if (key === 'a') store.selectAll()
          else if (key === 'i') store.invertSelection()
          else if (key === 'd') store.duplicatePanels(store.selectedIds)
          else return false
          return true
        }

        if (e.key === 'Escape') {
          if (store.toolPick || store.measurement) store.setTool(store.tool)
          else store.select(null)
          return true
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          store.removePanels(store.selectedIds)
          return true
        }
        if (e.key === '?') {
          void showCheatSheet()
          return true
        }
        if (TOOL_KEYS[e.key] && !e.altKey) {
          store.setTool(TOOL_KEYS[e.key])
          return true
        }

        const nudge = NUDGES[e.key]
        // Don't nudge mid-gesture: the readout owns the live delta then.
        if (nudge && store.selectedIds.length > 0 && !store.gesture) {
          const axis = e.altKey && nudge.axis === 1 ? 2 : nudge.axis
          // Screen "up" with Alt reads as "away from you", which is −Z.
          const sign = axis === 2 ? -nudge.sign : nudge.sign
          const step = gridStepMm(store.unit, store.precision) * (e.shiftKey ? 10 : 1)
          store.nudgeSelection(axis, sign * step)
          return true
        }
        return false
      })()

      if (handled) e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCheatSheet])
}
