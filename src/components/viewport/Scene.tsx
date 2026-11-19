import { useDesignStore } from '../../store/designStore'
import { solidKey, solidsOf } from '../../lib/cuts'
import { PanelMesh } from './PanelMesh'
import { OverlapHighlights } from './OverlapHighlights'
import { SnapHints } from './SnapHints'
import { ToolOverlay } from './ToolOverlay'
import { RotatePreview } from './RotatePreview'
import { FieldHighlight } from './FieldHighlight'

/** The cabinet itself: one mesh per panel, with its joints cut out of it
 *  (each mesh gets its shape as a string, so it only rebuilds when that
 *  changes), plus overlap markers at joints that aren't cut.
 *  Purely a projection of the store — holds no state of its own. */
export function Scene() {
  const panels = useDesignStore((s) => s.panels)
  const solids = solidsOf(panels)
  return (
    <>
      {panels.map((panel) => (
        <PanelMesh key={panel.id} panel={panel} solid={solidKey(panel, solids.get(panel.id))} />
      ))}
      <OverlapHighlights />
      <SnapHints />
      <ToolOverlay />
      <RotatePreview />
      <FieldHighlight />
    </>
  )
}
