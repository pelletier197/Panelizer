import { useEffect, useState, type ReactNode } from 'react'

const MIN_WIDTH = 260
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 320
const STORAGE_KEY = 'panelizer.ui.sidebar'

interface SidebarPrefs {
  width: number
  collapsed: boolean
}

function loadPrefs(): SidebarPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { width: DEFAULT_WIDTH, collapsed: false, ...JSON.parse(raw) }
  } catch {
    // ignore malformed / unavailable storage
  }
  return { width: DEFAULT_WIDTH, collapsed: false }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** The right-hand panel: draggable to resize (handle on its left edge) and
 *  collapsible. Width and collapsed state are remembered as a UI preference,
 *  independent of the saved design. */
export function ResizableSidebar({ children }: { children: ReactNode }) {
  const [{ width, collapsed }, setPrefs] = useState(loadPrefs)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ width, collapsed }))
    } catch {
      // best-effort
    }
  }, [width, collapsed])

  const setWidth = (w: number) => setPrefs((p) => ({ ...p, width: w }))
  const setCollapsed = (c: boolean) => setPrefs((p) => ({ ...p, collapsed: c }))

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const onMove = (ev: MouseEvent) =>
      setWidth(clamp(window.innerWidth - ev.clientX, MIN_WIDTH, MAX_WIDTH))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (collapsed) {
    return (
      <button className="sidebar-reopen" onClick={() => setCollapsed(false)} aria-label="Show panel">
        ‹
      </button>
    )
  }

  return (
    <>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startResize}
      />
      <aside className="workspace__sidebar" style={{ width }}>
        <div className="sidebar__topbar">
          <button className="sidebar__collapse" onClick={() => setCollapsed(true)} aria-label="Hide panel">
            ›
          </button>
        </div>
        {children}
      </aside>
    </>
  )
}
