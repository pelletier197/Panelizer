import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { cx } from './cx'

interface MenuProps {
  /** Trigger button contents. */
  label: ReactNode
  /** Which edge the popover aligns to. */
  align?: 'left' | 'right'
  ariaLabel?: string
  /** Trigger styling — `ghost` for triggers sitting inside a segmented group,
   *  `primary` when the trigger represents the active choice. */
  variant?: 'default' | 'ghost' | 'primary'
  /** Rendered with a `close` callback so items can dismiss the menu. */
  children: (close: () => void) => ReactNode
}

/** A button that opens a popover, closing on outside click or Escape. */
export function Menu({ label, align = 'left', ariaLabel, variant = 'default', children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <Button
        variant={variant}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </Button>
      {open && (
        <div
          className={cx(
            'absolute top-[calc(100%+4px)] z-50 min-w-max rounded border border-edge',
            'bg-surface shadow-lg shadow-black/40',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** A vertical list of menu items — the usual popover contents. */
export function MenuList({ children }: { children: ReactNode }) {
  return <div className="flex min-w-44 flex-col py-1">{children}</div>
}

/** One clickable row in a MenuList. */
export function MenuItem({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'cursor-pointer border-0 bg-transparent px-3 py-1.5 text-left text-ink',
        'hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40',
        danger && 'text-danger hover:bg-danger hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

/** A non-interactive heading separating groups of items. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-ink-dim uppercase">
      {children}
    </div>
  )
}

/** A row of mutually-exclusive choices (units, precision) inside a menu. */
export function MenuChoices<T extends string | number>({
  options,
  value,
  onChange,
  className = 'mx-3 mb-2',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** Outer spacing; the default fits it inside a menu. */
  className?: string
}) {
  return (
    // A real segmented control: equal-width targets big enough to hit, sharing
    // one recessed track so the lit one reads as the current choice.
    <div className={cx('flex gap-1 rounded-md border border-edge bg-bg/60 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 cursor-pointer rounded border px-2.5 py-1 text-small font-medium transition-colors',
            value === o.value
              ? 'border-accent bg-accent text-white'
              : 'border-transparent bg-transparent text-ink-dim hover:bg-surface-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
