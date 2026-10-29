import { useEffect } from 'react'
import { useDesignStore, type Tool } from '../store/designStore'
import { useConfirm } from '../components/ui/useConfirm'
import { frameView } from '../components/viewport/frameView'

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

/** The keymap as shown to the user, grouped. Kept beside the handler so the
 *  cheat sheet can't drift from what the keys actually do. The mouse group
 *  documents the viewport's pointer controls (orbit/pan/zoom come from
 *  OrbitControls, box-select from BoxSelect) so they're discoverable too. */
export const SHORTCUTS: { group: string; items: { keys: string; action: string }[] }[] = [
  {
    group: 'Mouse',
    items: [
      { keys: 'Drag', action: 'Orbit the camera' },
      { keys: 'Middle / Right-drag', action: 'Pan the camera' },
      { keys: 'Ctrl+drag', action: 'Pan the camera (trackpad)' },
      { keys: 'Wheel', action: 'Zoom' },
      { keys: 'Click', action: 'Select a panel (empty space deselects)' },
      { keys: 'Shift+click', action: 'Add or remove a panel from the selection' },
      { keys: 'Shift+drag', action: 'Box-select: add (→ fully inside, ← touching)' },
      { keys: 'Ctrl+Shift+drag', action: 'Box-select: remove from the selection' },
    ],
  },
  {
    group: 'Keyboard',
    items: [
      { keys: 'Ctrl+Z', action: 'Undo (in the move/resize box: cancel that drag)' },
      { keys: 'Ctrl+Y / Ctrl+Shift+Z', action: 'Redo' },
      { keys: 'Ctrl+A', action: 'Select all visible panels' },
      { keys: 'Ctrl+I', action: 'Invert selection' },
      { keys: 'Esc', action: 'Cancel the pick in progress, then deselect' },
      { keys: 'Ctrl+C / Ctrl+V', action: 'Copy selection / paste copies' },
      { keys: 'Ctrl+D', action: 'Duplicate selection' },
      { keys: 'Del / Backspace', action: 'Delete selection' },
      { keys: 'F', action: 'Frame the selection (or the whole design)' },
      { keys: 'H / Alt+H', action: 'Hide selection / show all hidden panels' },
      { keys: '1 – 4', action: 'Move, Snap point, Resize, Measure' },
      { keys: '?', action: 'Show this list' },
    ],
  },
]

/** Opens the shortcut list in a dialog — from `?` or the menu. */
export function useCheatSheet() {
  const confirm = useConfirm()
  return () =>
    confirm({
      title: 'Shortcuts',
      dismissOnly: true,
      wide: true,
      confirmLabel: 'Close',
      // One table per group, side by side when there's room, stacked otherwise.
      body: (
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
          {SHORTCUTS.map(({ group, items }) => (
            <section key={group}>
              <h3 className="m-0 mb-1.5 text-xs font-semibold tracking-wide text-ink-dim uppercase">{group}</h3>
              <table className="w-full border-collapse">
                <tbody>
                  {items.map((s) => (
                    <tr key={s.keys} className="border-b border-edge last:border-0">
                      <td className="py-1.5 pr-4 align-top font-mono whitespace-nowrap text-ink">{s.keys}</td>
                      <td className="py-1.5">{s.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      ),
    })
}

/**
 * Every global keyboard shortcut, in one place. Skipped while a field has focus
 * (so text edits keep their own undo) and while a modal is open.
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
          // Copy/paste only take over when there's something of ours to act on,
          // so copying selected page text still works as normal.
          else if (key === 'c' && store.selectedIds.length > 0 && !window.getSelection()?.toString())
            store.copySelection()
          else if (key === 'v' && store.clipboard.length > 0) store.paste()
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
        // By physical key: Alt+H on a Mac types `˙`, not `h`.
        if (e.code === 'KeyF') {
          const chosen = new Set(store.selectedIds)
          const selected = store.panels.filter((p) => chosen.has(p.id))
          frameView(selected.length > 0 ? selected : store.panels)
          return true
        }
        if (e.code === 'KeyH') {
          if (e.altKey) store.setHidden(store.panels.filter((p) => p.hidden).map((p) => p.id), false)
          else store.setHidden(store.selectedIds, true)
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
        return false
      })()

      if (handled) e.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showCheatSheet])
}
