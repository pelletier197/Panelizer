import { Toolbar } from './components/panels/Toolbar'
import { PropertiesPanel } from './components/panels/PropertiesPanel'
import { MaterialsPanel } from './components/panels/MaterialsPanel'
import { PartsPanel } from './components/panels/PartsPanel'
import { CutlistModal } from './components/panels/CutlistModal'
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

export default function App() {
  useSharedLink()
  useShortcuts()
  // On a phone the model gets the screen and the sidebar becomes a drawer
  // under it.
  const compact = useCompact()
  const Side = compact ? MobileDrawer : ResizableSidebar

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
      <CutlistModal />
      <ConfirmHost />
    </div>
  )
}
