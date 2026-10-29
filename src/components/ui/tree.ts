import { cx } from './cx'

/**
 * Shared look for the collapsible tables (the parts list, the cutlist's grain
 * list), so an expanded group and the rows it owns read as one block, clearly
 * apart from their siblings:
 *
 * - an open group row is raised and carries a solid accent bar on its left,
 * - its sub-rows sit on a recessed surface behind a fainter bar in the same
 *   spot, smaller and dimmer, with an indented `└` before the name,
 * - the last sub-row closes the block with a strong rule.
 *
 * Sub-rows put a <TreeBranch /> before their name.
 *
 * The bars are inset box-shadows rather than borders so they don't shift the
 * table's column widths. `highlighted` (selected or hovered) replaces the row's
 * own background rather than competing with it.
 */
export function treeGroup({ open, highlighted }: { open: boolean; highlighted: boolean }) {
  return cx(
    'transition-colors',
    open ? 'shadow-[inset_3px_0_0_var(--color-accent)]' : 'border-b border-edge/60',
    highlighted ? 'bg-accent/20 hover:bg-accent/25' : open ? 'bg-surface-2' : 'hover:bg-surface-2',
  )
}

export function treeChild({ last, highlighted }: { last: boolean; highlighted: boolean }) {
  return cx(
    'text-[12px] text-ink-dim transition-colors',
    'shadow-[inset_3px_0_0_color-mix(in_srgb,var(--color-accent)_35%,transparent)]',
    highlighted ? 'bg-accent/20 hover:bg-accent/25' : 'bg-bg hover:bg-surface-2',
    last && 'border-b border-edge-strong',
  )
}
