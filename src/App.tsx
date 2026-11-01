import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Toolbar } from './components/panels/Toolbar'
import { PropertiesPanel } from './components/panels/PropertiesPanel'
import { MaterialsPanel } from './components/panels/MaterialsPanel'
import { PartsPanel } from './components/panels/PartsPanel'
import { Viewport } from './components/viewport/Viewport'
import { GestureReadout } from './components/viewport/GestureReadout'
import { ViewportHint } from './components/viewport/ViewportHint'
import { FitButton } from './components/viewport/FitButton'
import { WebGLUnavailable } from './components/viewport/WebGLUnavailable'
import { ResizableSidebar } from './components/layout/ResizableSidebar'
import { MobileDrawer } from './components/layout/MobileDrawer'
import { ConfirmHost } from './components/ui/ConfirmDialog'
import { useShortcuts } from './hooks/useShortcuts'
import { useSharedLink } from './components/layout/useSharedLink'
import { hasWebGL } from './lib/webgl'
import { useCompact } from './hooks/useMedia'
import { useDesignStore } from './store/designStore'

// The cutlist and the presentation view are fetched the first time they're
// opened, so the editor doesn't wait for them.
const CutlistModal = lazy(() => import('./components/panels/CutlistModal').then((m) => ({ default: m.CutlistModal })))
const PresentView = lazy(() => import('./components/present/PresentView').then((m) => ({ default: m.PresentView })))

/** Renders `children` from the first time `open` is true, and keeps them
 *  mounted after, so a view keeps its state (the cutlist its layout) when
 *  closed and reopened. */
function OnceOpened({ open, children }: { open: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(open)
  if (open && !opened) setOpened(true)
  return opened ? <Suspense fallback={null}>{children}</Suspense> : null
}

export default function App() {
  useSharedLink()
  useShortcuts()
  // On a phone the model gets the screen and the sidebar becomes a drawer
  // under it.
  const compact = useCompact()
  const Side = compact ? MobileDrawer : ResizableSidebar
  const cutlistOpen = useDesignStore((s) => s.cutlistOpen)
  const presentOpen = useDesignStore((s) => s.presentOpen)

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <main className="flex min-h-0 flex-1 flex-col md:flex-row print:hidden">
        {/* One gate for the whole canvas area: without WebGL the overlays would
            otherwise float their controls over a dead viewport. */}
        <div className="relative min-h-0 min-w-0 flex-1">
          {hasWebGL() ? (
            <>
              <Viewport />
              <ViewportHint />
              <FitButton />
              <GestureReadout />
            </>
          ) : (
            <WebGLUnavailable />
          )}
        </div>
        <Side>
          <PropertiesPanel />
          <MaterialsPanel />
          <PartsPanel />
        </Side>
      </main>
      <OnceOpened open={cutlistOpen}>
        <CutlistModal />
      </OnceOpened>
      <OnceOpened open={presentOpen}>
        <PresentView />
      </OnceOpened>
      <ConfirmHost />
    </div>
  )
}
