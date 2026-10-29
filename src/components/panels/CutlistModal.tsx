import { useRef, useState } from 'react'
import { useDesignStore } from '../../store/designStore'
import { Button } from '../ui/Button'
import { Kbd } from '../ui/Kbd'
import { formatKeys, KEYS } from '../ui/keys'
import { useDragResize } from '../../hooks/useDragResize'
import { usePersistentState } from '../../hooks/usePersistentState'
import { CutResult } from './cutlist/CutResult'
import { GrainEditor } from './cutlist/GrainEditor'
import { StockList } from './cutlist/StockList'
import { useCursorTooltip } from './cutlist/tooltip'
import { useCutlistModel, useEscapeToClose, usePrintMode } from './cutlist/useCutlistModel'

/** Controls-panel width bounds + persisted UI preference. */
const CONTROLS_MIN = 240
const CONTROLS_MAX = 640
const CONTROLS_DEFAULT = 320
const CONTROLS_KEY = 'panelizer.ui.cutlistControls'

const reviveWidth = (stored: unknown): number | null =>
  typeof stored === 'number' && stored >= CONTROLS_MIN && stored <= CONTROLS_MAX ? stored : null

/**
 * Full-screen cutlist view. You set the global kerf and margin, enter the sheet
 * goods you have, and it nests the project's parts onto those sheets — grouped
 * by material + thickness — showing a cut diagram and the waste per material.
 * Grain per part is edited here too (defaults to the longer edge).
 */
export function CutlistModal() {
  const open = useDesignStore((s) => s.cutlistOpen)
  const setOpen = useDesignStore((s) => s.setCutlistOpen)
  const unit = useDesignStore((s) => s.unit)
  const precision = useDesignStore((s) => s.precision)
  const margin = useDesignStore((s) => s.margin)

  const model = useCutlistModel(open)
  const printing = usePrintMode()
  const tooltip = useCursorTooltip()

  const asideRef = useRef<HTMLElement>(null)
  const [controlsWidth, setControlsWidth] = usePersistentState(CONTROLS_KEY, CONTROLS_DEFAULT, reviveWidth)

  // Panels currently hovered — shared between the grain list and the cut
  // diagrams so hovering either side highlights the matching parts.
  const [hovered, setHovered] = useState<string[] | null>(null)

  useEscapeToClose(open, () => setOpen(false))

  // The controls pane grows rightward from its own left edge, which is captured
  // at pointer-down so it can't drift as the pane resizes under the cursor.
  const startResize = useDragResize({
    min: CONTROLS_MIN,
    max: CONTROLS_MAX,
    begin: () => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0
      return (move) => move.clientX - left
    },
    onWidth: setControlsWidth,
  })

  if (!open) return null

  return (
    <div
      data-print-root
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 print:static print:block print:bg-white print:p-0"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-edge bg-bg shadow-2xl print:h-auto print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-13 shrink-0 items-center gap-4 border-b border-edge bg-surface px-4 print:hidden">
          <h2 className="m-0 flex-1 text-base font-semibold">Cutlist</h2>
          <Button onClick={() => window.print()}>
            Print
            <Kbd keys={KEYS.print} />
          </Button>
          {/* Close is fenced off behind a divider so it can't be fat-fingered
              while reaching for Print. */}
          <span className="h-6 w-px bg-edge" />
          <Button variant="ghost" icon aria-label="Close" title={`Close (${formatKeys(KEYS.cancel)})`} onClick={() => setOpen(false)}>
            ✕
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 print:block">
          <aside
            className="flex shrink-0 flex-col overflow-y-auto bg-surface print:hidden"
            ref={asideRef}
            style={{ width: controlsWidth }}
          >
            <StockList unit={unit} precision={precision} />
            <GrainEditor
              groups={model.grainGroups}
              unit={unit}
              hovered={hovered}
              onHover={setHovered}
              unplacedNote={model.unplacedNote}
              tipProps={tooltip.tipProps}
            />
          </aside>

          <div
            className="w-1 shrink-0 cursor-col-resize bg-edge transition-colors hover:bg-accent print:hidden"
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startResize}
          />

          <CutResult
            result={model.result}
            pending={model.pending}
            parts={model.cutParts}
            missing={model.missing}
            unit={unit}
            margin={margin}
            hovered={hovered}
            onHover={setHovered}
            showTip={tooltip.show}
            hideTip={tooltip.hide}
            printing={printing}
          />
        </div>

        {tooltip.node}
      </div>
    </div>
  )
}
