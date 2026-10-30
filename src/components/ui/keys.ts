/**
 * The key combo for every action that has one, written once. The keymap's
 * cheat sheet and the key chips on buttons both read from here, so a button
 * can't advertise a combo the handler doesn't honour. (The handler itself
 * matches on key events in `hooks/useShortcuts.tsx`.)
 */
export const KEYS = {
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  selectAll: 'Ctrl+A',
  invert: 'Ctrl+I',
  copy: 'Ctrl+C',
  paste: 'Ctrl+V',
  duplicate: 'Ctrl+D',
  delete: 'Del',
  frame: 'F',
  hide: 'H',
  showAll: 'Alt+H',
  rotate: 'R',
  help: '?',
  cancel: 'Esc',
  confirm: 'Enter',
  print: 'Ctrl+P',
} as const

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/** A combo as this platform writes it: `Ctrl+D` on Windows / Linux, `⌘D` on a
 *  Mac (where the handler accepts Cmd for Ctrl, and Del is the ⌫ key). */
export function formatKeys(keys: string, mac = IS_MAC): string {
  if (!mac) return keys
  return keys
    .replace(/Ctrl\+?/g, '⌘')
    .replace(/Alt\+?/g, '⌥')
    .replace(/Shift\+?/g, '⇧')
    .replace(/^Del$/, '⌫')
}
