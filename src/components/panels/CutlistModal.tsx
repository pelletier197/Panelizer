import { useEffect, useRef, useState } from 'react'
import { useDesignStore } from '../../store/designStore'
import { allSheetsZipFilename, sheetDxf, sheetDxfFilename } from '../../lib/dxf'
import type { CutlistResult } from '../../lib/nesting'
import { downloadFile } from '../../lib/persistence'
import { zip } from '../../lib/zip'
import { formatMeasurement } from '../../lib/units'
import { Button } from '../ui/Button'
import { Kbd } from '../ui/Kbd'
import { Menu, MenuItem, MenuLabel, MenuList } from '../ui/Menu'
import { Swatch } from '../ui/Panel'
import { cx } from '../ui/cx'
import { formatKeys, KEYS } from '../ui/keys'
import { useDragResize } from '../../hooks/useDragResize'
import { usePersistentState } from '../../hooks/usePersistentState'
import { useCompact } from '../../hooks/useMedia'
import { CutResult } from './cutlist/CutResult'
import { GrainEditor } from './cutlist/GrainEditor'
import { StockList } from './cutlist/StockList'
import { useCursorTooltip } from './cutlist/tooltip'
import { sheetKey, useCutlistModel, useEscapeToClose, usePrintMode } from './cutlist/useCutlistModel'

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
  // Sheets the Export item being pointed at would export, outlined.
  const [exportPreview, setExportPreview] = useState<string[] | null>(null)
  // On a phone the controls fold away above the sheets, which get the screen.
  const compact = useCompact()
  const [controlsOpen, setControlsOpen] = useState(false)
  const stockCount = useDesignStore((s) => s.stocks.length)

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 md:p-6 print:static print:block print:bg-white print:p-0"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex h-full w-full flex-col overflow-hidden border-edge bg-bg shadow-2xl md:rounded-lg md:border print:h-auto print:border-0 print:shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-13 shrink-0 items-center gap-3 border-b border-edge bg-surface px-3 md:gap-4 md:px-4 print:hidden">
          <h2 className="m-0 flex-1 text-base font-semibold">Cutlist</h2>
          <ExportMenu result={model.result} pending={model.pending} onPreview={setExportPreview} />
          {/* Close is fenced off behind a divider so it can't be fat-fingered
              while reaching for Export. */}
          <span className="h-6 w-px bg-edge" />
          <Button variant="ghost" icon aria-label="Close" title={`Close (${formatKeys(KEYS.cancel)})`} onClick={() => setOpen(false)}>
            ✕
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row print:block">
          {compact && (
            <button
              type="button"
              aria-expanded={controlsOpen}
              className="flex shrink-0 cursor-pointer items-center justify-between border-0 border-b border-edge bg-surface px-4 py-2.5 text-sm text-ink print:hidden"
              onClick={() => setControlsOpen((o) => !o)}
            >
              <span>
                Settings &amp; sheet goods
                <span className="ml-2 text-xs text-ink-dim">
                  {stockCount} sheet good{stockCount === 1 ? '' : 's'}
                </span>
              </span>
              <span className="text-xs text-ink-dim">{controlsOpen ? 'Hide ▴' : 'Show ▾'}</span>
            </button>
          )}
          <aside
            className={cx(
              'flex shrink-0 flex-col overflow-y-auto bg-surface print:hidden',
              compact && 'max-h-[50dvh] border-b border-edge',
              compact && !controlsOpen && 'hidden',
            )}
            ref={asideRef}
            style={compact ? undefined : { width: controlsWidth }}
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
            className="hidden w-1 shrink-0 cursor-col-resize bg-edge transition-colors hover:bg-accent md:block print:hidden"
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
            previewSheets={exportPreview}
          />
        </div>

        {tooltip.node}
      </div>
    </div>
  )
}

/**
 * Ways out of the app for the layout: printing (or saving as PDF from the print
 * dialog), and DXF for CNC software — every sheet at once as a .zip, or one
 * sheet, as a CNC cuts one sheet per job. Pointing at an item outlines the
 * sheets it exports.
 */
function ExportMenu({
  result,
  pending,
  onPreview,
}: {
  result: CutlistResult
  pending: boolean
  onPreview: (sheetKeys: string[] | null) => void
}) {
  const projectName = useDesignStore((s) => s.name)
  const unit = useDesignStore((s) => s.unit)
  const sheets = result.groups.flatMap((group) =>
    group.sheets.map((sheet) => ({
      group,
      sheet,
      key: sheetKey(group.key, sheet.index),
      filename: sheetDxfFilename(projectName, group, sheet),
    })),
  )
  const allKeys = sheets.map((s) => s.key)
  const preview = (keys: string[]) => (on: boolean) => onPreview(on ? keys : null)

  const exportAll = () => {
    // Two groups can share a material name and thickness; keep their files apart.
    const seen = new Map<string, number>()
    const files = sheets.map(({ sheet, filename }) => {
      const n = (seen.get(filename) ?? 0) + 1
      seen.set(filename, n)
      return { name: n === 1 ? filename : filename.replace(/.dxf$/, `-${n}.dxf`), text: sheetDxf(sheet) }
    })
    downloadFile(zip(files), allSheetsZipFilename(projectName), 'application/zip')
  }

  return (
    <Menu label="Export" align="right">
      {(close) => (
        <MenuList>
          <ClearOnClose onClear={() => onPreview(null)} />
          <MenuItem
            title="Print the cut diagrams and parts list, or save them as a PDF from the print dialog"
            onPreview={preview(allKeys)}
            onClick={() => {
              close()
              // After the menu has closed, so the dialog opens on a clean page.
              setTimeout(() => window.print())
            }}
          >
            <span className="flex items-center justify-between gap-4">
              Print / PDF
              <Kbd keys={KEYS.print} />
            </span>
          </MenuItem>
          <MenuLabel>DXF for CNC · mm</MenuLabel>
          {sheets.length === 0 && <MenuItem disabled onClick={() => {}}>No sheets laid out yet</MenuItem>}
          {sheets.length > 1 && (
            <MenuItem
              // A layout still being worked out would export the previous one.
              disabled={pending}
              title={`Downloads ${allSheetsZipFilename(projectName)}: one DXF per sheet`}
              onPreview={preview(allKeys)}
              onClick={() => {
                close()
                exportAll()
              }}
            >
              All {sheets.length} sheets <span className="text-ink-dim">· .zip</span>
            </MenuItem>
          )}
          {sheets.map(({ group, sheet, key, filename }) => (
            <MenuItem
              key={key}
              disabled={pending}
              title={`Downloads ${filename}`}
              onPreview={preview([key])}
              onClick={() => {
                close()
                downloadFile(sheetDxf(sheet), filename, 'application/dxf')
              }}
            >
              <span className="flex items-center gap-1.5">
                <Swatch color={group.color} />
                {group.materialName} · {formatMeasurement(group.thickness, unit)}
                <span className="text-ink-dim">— sheet {sheet.index}</span>
              </span>
            </MenuItem>
          ))}
        </MenuList>
      )}
    </Menu>
  )
}

/** Runs `onClear` when the menu closes (its contents unmount) — however it
 *  closes, so no preview is left lit behind it. */
function ClearOnClose({ onClear }: { onClear: () => void }) {
  const latest = useRef(onClear)
  latest.current = onClear
  useEffect(() => () => latest.current(), [])
  return null
}
