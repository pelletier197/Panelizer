/** The indent and connector in front of a sub-row's name, in the collapsible
 *  tables (see ui/tree for the row styling it goes with). */
export function TreeBranch() {
  return (
    <span className="mr-1.5 ml-1 shrink-0 font-mono text-ink-faint" aria-hidden>
      └
    </span>
  )
}
