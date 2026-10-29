import { Toolbar } from './components/panels/Toolbar'
import { PropertiesPanel } from './components/panels/PropertiesPanel'
import { MaterialsPanel } from './components/panels/MaterialsPanel'
import { PartsPanel } from './components/panels/PartsPanel'
import { CutlistModal } from './components/panels/CutlistModal'
import { Viewport } from './components/viewport/Viewport'
import { ViewportControls } from './components/viewport/ViewportControls'
import { GestureReadout } from './components/viewport/GestureReadout'
import { WebGLUnavailable } from './components/viewport/WebGLUnavailable'
import { ResizableSidebar } from './components/layout/ResizableSidebar'
import { ConfirmHost } from './components/ui/ConfirmDialog'
import { useShortcuts } from './hooks/useShortcuts'
import { useSharedLink } from './components/layout/useSharedLink'
import { hasWebGL } from './lib/webgl'

export default function App() {
  useSharedLink()
  useShortcuts()

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <main className="flex min-h-0 flex-1 print:hidden">
        {/* One gate for the whole canvas area: without WebGL the overlays would
            otherwise float their controls over a dead viewport. */}
        <div className="relative min-w-0 flex-1">
          {hasWebGL() ? (
            <>
              <Viewport />
              <ViewportControls />
              <GestureReadout />
            </>
          ) : (
            <WebGLUnavailable />
          )}
        </div>
        <ResizableSidebar>
          <PropertiesPanel />
          <MaterialsPanel />
          <PartsPanel />
        </ResizableSidebar>
      </main>
      <CutlistModal />
      <ConfirmHost />
    </div>
  )
}
