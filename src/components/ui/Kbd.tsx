import { cx } from './cx'
import { formatKeys } from './keys'

/**
 * A key-combo chip, shown inside a button so its shortcut is discoverable
 * without hovering or opening the cheat sheet. Takes its colour from the
 * button (`currentColor`), dimmed, so it reads on any button variant.
 */
export function Kbd({ keys, className }: { keys: string; className?: string }) {
  return (
    <kbd
      className={cx(
        'ml-1.5 inline-block rounded-xs border border-current/25 px-1 font-mono text-[10px] leading-[14px] font-normal opacity-70',
        className,
      )}
    >
      {formatKeys(keys)}
    </kbd>
  )
}
