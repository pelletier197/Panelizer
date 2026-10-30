import { cx } from './cx'
import { formatKeys } from './keys'

/**
 * A key-combo chip, shown inside a button so its shortcut is discoverable
 * without hovering or opening the cheat sheet. Takes its colour from the
 * button (`currentColor`), dimmed, so it reads on any button variant.
 */
export function Kbd({ keys, className, inline = false }: { keys: string; className?: string; inline?: boolean }) {
  return (
    <kbd
      className={cx(
        'inline-block rounded-xs border border-current/25 px-1 font-mono text-[10px] leading-[14px] font-normal opacity-70',
        // No keyboard to press them with on a touch screen.
        'pointer-coarse:hidden',
        // After a button's label it needs a gap; inside running text it doesn't.
        !inline && 'ml-1.5',
        className,
      )}
    >
      {formatKeys(keys)}
    </kbd>
  )
}
