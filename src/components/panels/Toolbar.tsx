import { useRef } from 'react'
import type { Panel } from '../../types/panel'
import { currentDesign, useDesignStore, type Tool } from '../../store/designStore'
import { TOOL_SHORTCUTS, useCheatSheet } from '../../hooks/useShortcuts'
import { downloadDesign, parse } from '../../lib/persistence'
import { designToLink } from '../../lib/share'
import { defaultThinThickness } from '../../lib/panel'
import { DOCUMENT_UNITS, IMPERIAL_PRECISIONS, sameSystem, type Unit } from '../../lib/units'
import { Menu, MenuChoices, MenuItem, MenuLabel, MenuList } from '../ui/Menu'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { useConfirm } from '../ui/useConfirm'
import { CopyField } from '../ui/CopyField'
import { ToolHint } from '../layout/ToolHint'

/** Quick-add presets so a carcass can be roughed out in a few clicks. Each sets
 *  the orientation and a typical size; everything stays editable afterwards.
 *  Thickness is left to the document-unit default, except thin parts (a back),
 *  which are flagged so they get the thin-stock default. (A shelf is just a
 *  horizontal panel, i.e. the same as top/bottom.) */
const ADD_PRESETS: { label: string; preset: Partial<Panel>; thin?: boolean }[] = [
  { label: 'Side', preset: { name: 'Side', normal: 'x', length: 580, width: 720 } },
  { label: 'Top / Bottom / Shelf', preset: { name: 'Top', normal: 'y', length: 600, width: 580 } },
  { label: 'Back', preset: { name: 'Back', normal: 'z', length: 600, width: 720 }, thin: true },
]

/** Toolbar buckets. A bucket with several modes opens a dropdown; a bucket with
 *  a single mode is just a toggle button. */
const TOOL_SECTIONS: { label: string; tools: { tool: Tool; label: string }[] }[] = [
  {
    label: 'Move',
    tools: [
      { tool: 'move', label: 'Free' },
      { tool: 'move-snap', label: 'Snap point' },
    ],
  },
  { label: 'Resize', tools: [{ tool: 'resize', label: 'Resize' }] },
  { label: 'Measure', tools: [{ tool: 'measure', label: 'Measure' }] },
]

const DIVIDER = <div className="my-1 border-t border-edge" />

export function Toolbar() {
  // Only emptiness is needed to render; export and share read the whole design
  // at click time, so a drag doesn't re-render the toolbar every frame.
  const empty = useDesignStore((s) => s.panels.length === 0)
  const unit = useDesignStore((s) => s.unit)
  const setUnit = useDesignStore((s) => s.setUnit)
  const convertUnit = useDesignStore((s) => s.convertUnit)
  const precision = useDesignStore((s) => s.precision)
  const setPrecision = useDesignStore((s) => s.setPrecision)
  const setCutlistOpen = useDesignStore((s) => s.setCutlistOpen)
  const tool = useDesignStore((s) => s.tool)
  const setTool = useDesignStore((s) => s.setTool)
  const addPanel = useDesignStore((s) => s.addPanel)
  const loadDesign = useDesignStore((s) => s.loadDesign)
  const fixPrecision = useDesignStore((s) => s.fixPrecision)
  const clear = useDesignStore((s) => s.clear)
  const fileInput = useRef<HTMLInputElement>(null)
  const showCheatSheet = useCheatSheet()
  const confirm = useConfirm()

  // Changing the document unit converts the geometry onto the new unit's grid.
  // Crossing measuring systems (mm↔inch) is lossy — every size snaps to the
  // nearest 1/16" and small gaps close — so confirm first.
  const changeUnit = async (next: Unit) => {
    if (next === unit) return
    if (empty) {
      setUnit(next)
      return
    }
    if (!sameSystem(next, unit)) {
      const ok = await confirm({
        title: `Switch to ${next === 'inch' ? 'inches' : next}?`,
        body: `Every size snaps to the nearest ${next === 'inch' ? '1/16"' : 'mm'} and small joint gaps are closed. This is lossy and can't be undone cleanly.`,
        confirmLabel: 'Convert',
      })
      if (!ok) return
    }
    convertUnit(next)
  }

  // The whole design travels inside the link, so there is nothing to upload and
  // no server involved. Copying is left to the field rather than done up front:
  // one predictable path, and the link is always there to select by hand.
  const share = async (close: () => void) => {
    close()
    const link = await designToLink(currentDesign())

    await confirm({
      title: 'Share this design',
      body: (
        <>
          <p className="m-0 mb-3">
            Anyone who opens this link gets a copy of the design. Nothing is uploaded — the whole
            thing travels inside the link itself.
          </p>
          <CopyField value={link} label="Copy link" />
        </>
      ),
      confirmLabel: 'Done',
      dismissOnly: true,
    })
  }

  const handleImport = async (file: File) => {
    try {
      loadDesign(parse(await file.text()))
    } catch (error) {
      await confirm({
        title: 'Could not import that file',
        body: error instanceof Error ? error.message : 'Could not read that file.',
        confirmLabel: 'OK',
        dismissOnly: true,
      })
    }
  }

  return (
    <>
      {/* Spacing is per-cluster, not one uniform gap: separate clusters need
          room between them, but the members of a cluster belong together and
          look adrift if given the same. */}
      <header className="flex h-13 shrink-0 items-center border-b border-edge bg-surface px-4 print:hidden">
        <img src="/Panelizer/logo.png" alt="Panelizer" className="mr-4 h-5 w-auto opacity-90" />

        <Menu label="+ Add">
          {(close) => (
            <MenuList>
              {ADD_PRESETS.map(({ label, preset, thin }) => (
                <MenuItem
                  key={label}
                  onClick={() => {
                    addPanel(thin ? { ...preset, thickness: defaultThinThickness(unit) } : preset)
                    close()
                  }}
                >
                  {label}
                </MenuItem>
              ))}
            </MenuList>
          )}
        </Menu>

        <div
          className="ml-6 flex items-center gap-2 rounded-md border border-edge bg-bg/60 p-1.5"
          role="group"
          aria-label="Tools"
        >
          {TOOL_SECTIONS.map((section) => {
            const active = section.tools.find((t) => t.tool === tool)

            // Single-mode bucket: a plain toggle button.
            if (section.tools.length === 1) {
              const { tool: t, label } = section.tools[0]
              return (
                <Button
                  key={section.label}
                  variant={tool === t ? 'primary' : 'ghost'}
                  title={`${label} (${TOOL_SHORTCUTS[t]})`}
                  onClick={() => setTool(t)}
                >
                  {label}
                </Button>
              )
            }

            // Multi-mode bucket: a dropdown showing the active sub-mode. Wears
            // the same `primary` fill as a lit single-mode button, so "this is
            // the active tool" reads identically across the whole group.
            return (
              <Menu
                key={section.label}
                ariaLabel={section.label}
                variant={active ? 'primary' : 'ghost'}
                label={
                  <span className="flex items-center gap-1.5">
                    {section.label}
                    {active && (
                      <span className="text-micro rounded-xs bg-white/20 px-1 py-px text-white">
                        {active.label}
                      </span>
                    )}
                  </span>
                }
              >
                {(close) => (
                  <MenuList>
                    {section.tools.map(({ tool: t, label }) => (
                      <MenuItem
                        key={t}
                        onClick={() => {
                          setTool(t)
                          close()
                        }}
                      >
                        <span className="flex items-center gap-4">
                          <span className={cx('flex-1', tool === t && 'text-accent')}>{label}</span>
                          <kbd className="text-micro text-ink-faint">{TOOL_SHORTCUTS[t]}</kbd>
                        </span>
                      </MenuItem>
                    ))}
                  </MenuList>
                )}
              </Menu>
            )
          })}
        </div>

        <div className="flex-1" />

        {/* Cutlist and the document menu are one cluster — the divider marks
            them as different kinds of control without pushing them apart. */}
        <div className="flex items-center gap-2">
          <Button variant="primary" disabled={empty} onClick={() => setCutlistOpen(true)}>
            Cutlist
          </Button>

          <span className="h-6 w-px bg-edge" />

          <Menu label="☰" ariaLabel="Document menu" align="right" variant="ghost">
          {(close) => (
            <MenuList>
              {/* Unit and precision are one decision — precision only means
                  anything in inches — so they sit together, above the file
                  actions. */}
              <MenuLabel>Default document unit</MenuLabel>
              <MenuChoices options={DOCUMENT_UNITS} value={unit} onChange={changeUnit} />

              {unit === 'inch' && (
                <>
                  <MenuLabel>Precision</MenuLabel>
                  <MenuChoices
                    options={IMPERIAL_PRECISIONS.map((p) => ({ value: p, label: `1/${p}` }))}
                    value={precision}
                    onChange={setPrecision}
                  />
                </>
              )}

              {DIVIDER}

              <MenuItem disabled={empty} onClick={() => void share(close)}>
                Share link…
              </MenuItem>
              <MenuItem
                disabled={empty}
                onClick={() => {
                  downloadDesign(currentDesign())
                  close()
                }}
              >
                Export…
              </MenuItem>
              <MenuItem
                onClick={() => {
                  fileInput.current?.click()
                  close()
                }}
              >
                Import…
              </MenuItem>

              {DIVIDER}

              <MenuItem
                disabled={empty}
                onClick={() => {
                  fixPrecision()
                  close()
                }}
              >
                Fix precision
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close()
                  void showCheatSheet()
                }}
              >
                Shortcuts &amp; mouse controls (?)
              </MenuItem>

              {DIVIDER}

              <MenuItem
                danger
                disabled={empty}
                onClick={async () => {
                  close()
                  if (!empty) {
                    const ok = await confirm({
                      title: 'Clear the whole design?',
                      body: 'Every panel and sheet is removed. This can be undone with Ctrl+Z.',
                      confirmLabel: 'Clear all',
                      destructive: true,
                    })
                    if (ok) clear()
                  }
                }}
              >
                New (clear all)
              </MenuItem>
            </MenuList>
          )}
          </Menu>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImport(file)
            e.target.value = '' // allow re-importing the same filename
          }}
        />
      </header>
      <ToolHint />
    </>
  )
}
