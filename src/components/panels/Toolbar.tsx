import { useRef } from 'react'
import type { Panel } from '../../types/panel'
import { useDesignStore, type Tool } from '../../store/designStore'
import { downloadDesign, parse } from '../../lib/persistence'
import { DOCUMENT_UNITS } from '../../lib/units'
import { Menu } from '../ui/Menu'
import { ToolHint } from '../layout/ToolHint'

/** Quick-add presets so a carcass can be roughed out in a few clicks. Each sets
 *  the orientation and a typical size; everything stays editable afterwards.
 *  (A shelf is just a horizontal panel, i.e. the same as top/bottom.) */
const ADD_PRESETS: { label: string; preset: Partial<Panel> }[] = [
  { label: 'Side', preset: { name: 'Side', normal: 'x', length: 580, width: 720 } },
  { label: 'Top / Bottom / Shelf', preset: { name: 'Top', normal: 'y', length: 600, width: 580 } },
  { label: 'Back', preset: { name: 'Back', normal: 'z', length: 600, width: 720, thickness: 6 } },
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

export function Toolbar() {
  const panels = useDesignStore((s) => s.panels)
  const materials = useDesignStore((s) => s.materials)
  const unit = useDesignStore((s) => s.unit)
  const setUnit = useDesignStore((s) => s.setUnit)
  const tool = useDesignStore((s) => s.tool)
  const setTool = useDesignStore((s) => s.setTool)
  const addPanel = useDesignStore((s) => s.addPanel)
  const loadDesign = useDesignStore((s) => s.loadDesign)
  const clear = useDesignStore((s) => s.clear)
  const fileInput = useRef<HTMLInputElement>(null)
  const empty = panels.length === 0

  const handleImport = async (file: File) => {
    try {
      loadDesign(parse(await file.text()))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not read that file.')
    }
  }

  return (
    <>
    <header className="toolbar">
      <div className="toolbar__brand">Wood3D</div>

      <Menu label="+ Add">
        {(close) => (
          <div className="menu__list">
            {ADD_PRESETS.map(({ label, preset }) => (
              <button
                key={label}
                className="menu__item"
                onClick={() => {
                  addPanel(preset)
                  close()
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </Menu>

      <div className="toolbar__group" role="group" aria-label="Tools">
        {TOOL_SECTIONS.map((section) => {
          const active = section.tools.find((t) => t.tool === tool)

          // Single-mode bucket: a plain toggle button.
          if (section.tools.length === 1) {
            const { tool: t, label } = section.tools[0]
            return (
              <button
                key={section.label}
                className={tool === t ? 'is-active' : ''}
                onClick={() => setTool(t)}
              >
                {label}
              </button>
            )
          }

          // Multi-mode bucket: a dropdown showing the active sub-mode.
          return (
            <Menu
              key={section.label}
              ariaLabel={section.label}
              label={
                <span className={active ? 'toolbar__bucket is-active' : 'toolbar__bucket'}>
                  {section.label}
                  {active && <span className="toolbar__bucket-mode">{active.label}</span>}
                </span>
              }
            >
              {(close) => (
                <div className="menu__list">
                  {section.tools.map(({ tool: t, label }) => (
                    <button
                      key={t}
                      className={tool === t ? 'menu__item is-active' : 'menu__item'}
                      onClick={() => {
                        setTool(t)
                        close()
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </Menu>
          )
        })}
      </div>

      <div className="toolbar__spacer" />

      <Menu label="☰" ariaLabel="Document menu" align="right">
        {(close) => (
          <div className="menu__list">
            <div className="menu__label">Default document unit</div>
            <div className="menu__units">
              {DOCUMENT_UNITS.map(({ value, label }) => (
                <button
                  key={value}
                  className={unit === value ? 'is-active' : ''}
                  onClick={() => setUnit(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="menu__divider" />

            <button
              className="menu__item"
              disabled={empty}
              onClick={() => {
                downloadDesign({ panels, materials, unit })
                close()
              }}
            >
              Export…
            </button>
            <button
              className="menu__item"
              onClick={() => {
                fileInput.current?.click()
                close()
              }}
            >
              Import…
            </button>

            <div className="menu__divider" />

            <button
              className="menu__item menu__item--danger"
              disabled={empty}
              onClick={() => {
                if (!empty && confirm('Clear the whole design?')) clear()
                close()
              }}
            >
              New (clear all)
            </button>
          </div>
        )}
      </Menu>

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
