import { useDesignStore } from '../../store/designStore'
import { PanelMesh } from './PanelMesh'
import { OverlapHighlights } from './OverlapHighlights'
import { SnapHints } from './SnapHints'
import { ToolOverlay } from './ToolOverlay'

/** The cabinet itself: one mesh per panel, plus overlap markers at joints.
 *  Purely a projection of the store — holds no state of its own. */
export function Scene() {
  const panels = useDesignStore((s) => s.panels)
  return (
    <>
      {panels.map((panel) => (
        <PanelMesh key={panel.id} panel={panel} />
      ))}
      <OverlapHighlights />
      <SnapHints />
      <ToolOverlay />
    </>
  )
}
