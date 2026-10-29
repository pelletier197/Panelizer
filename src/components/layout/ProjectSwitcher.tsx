import { useEffect, useState } from 'react'
import { DEFAULT_NAME } from '../../lib/persistence'
import { listProjects, type ProjectEntry } from '../../lib/projects'
import { useDesignStore } from '../../store/designStore'
import { Menu, MenuItem, MenuLabel, MenuList } from '../ui/Menu'
import { useConfirm } from '../ui/useConfirm'
import { cx } from '../ui/cx'

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a plain date. */
function timeAgo(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return new Date(ms).toLocaleDateString()
}

/**
 * The project's name, editable in place, and a menu of every project saved in
 * this browser: start a new one, switch to another, or delete one.
 *
 * Projects live in localStorage only, which the browser can clear — the menu
 * says so, and Export remains the way to keep a copy.
 */
export function ProjectSwitcher() {
  const name = useDesignStore((s) => s.name)
  const projectId = useDesignStore((s) => s.projectId)
  const setName = useDesignStore((s) => s.setName)
  const newProject = useDesignStore((s) => s.newProject)
  const openProject = useDesignStore((s) => s.openProject)
  const deleteProject = useDesignStore((s) => s.deleteProject)
  const confirm = useConfirm()

  // The browser tab shows which project is open.
  useEffect(() => {
    document.title = `${name} · Panelizer`
  }, [name])

  const remove = async (entry: ProjectEntry, close: () => void) => {
    close()
    const ok = await confirm({
      title: `Delete “${entry.name}”?`,
      body: 'It is removed from this browser for good. Export it first if you want to keep a copy.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (ok) deleteProject(entry.id)
  }

  return (
    <div className="mr-4 flex items-center gap-0.5">
      <NameField value={name} onChange={setName} />

      <Menu label={<ChevronDown />} ariaLabel="Projects" variant="ghost">
        {(close) => {
          // Read when the menu opens: the list lives in storage, not the store.
          const entries = listProjects()
          return (
            <MenuList>
              <MenuItem
                onClick={() => {
                  close()
                  newProject()
                }}
              >
                + New project
              </MenuItem>
              <div className="my-1 border-t border-edge" />
              <MenuLabel>Saved in this browser</MenuLabel>
              <div className="max-h-80 overflow-y-auto">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={cx(
                      'group flex items-center pr-1 hover:bg-surface-2',
                      entry.id === projectId && 'shadow-[inset_3px_0_0_var(--color-accent)]',
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer flex-col border-0 bg-transparent px-3 py-1.5 text-left"
                      onClick={() => {
                        close()
                        openProject(entry.id)
                      }}
                    >
                      <span className={cx('max-w-64 truncate', entry.id === projectId ? 'text-accent' : 'text-ink')}>
                        {entry.name}
                      </span>
                      <span className="text-micro text-ink-faint">
                        {entry.panelCount} panel{entry.panelCount === 1 ? '' : 's'} · {timeAgo(entry.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer rounded border-0 bg-transparent px-1.5 py-1 text-ink-faint opacity-0 group-hover:opacity-100 hover:bg-danger hover:text-white focus:opacity-100"
                      aria-label={`Delete ${entry.name}`}
                      onClick={() => void remove(entry, close)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-micro m-0 max-w-64 px-3 pt-2 pb-1 text-ink-faint">
                Kept in this browser only, and can be cleared with its data. Export to keep a copy.
              </p>
            </MenuList>
          )
        }}
      </Menu>
    </div>
  )
}

/**
 * The project name as plain-looking text that edits in place. Typing renames
 * as you go (each keystroke is an edit, like a panel's name); leaving it blank
 * puts the default name back rather than saving a nameless project.
 */
function NameField({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <input
      type="text"
      aria-label="Project name"
      title="Rename project"
      className={cx(
        'w-44 truncate rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-ink',
        'transition-colors hover:border-edge focus:border-accent focus:bg-bg focus:outline-none',
      )}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        if (e.target.value.trim()) onChange(e.target.value)
      }}
      onBlur={() => {
        if (!draft.trim()) {
          setDraft(DEFAULT_NAME)
          onChange(DEFAULT_NAME)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
      }}
    />
  )
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
