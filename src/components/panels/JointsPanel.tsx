import { useShallow } from 'zustand/react/shallow'
import type { Panel } from '../../types/panel'
import { useDesignStore } from '../../store/designStore'
import { describeJoint, jointGroup, partPairs, readCorner, readJoint, sharedBox } from '../../lib/joints'
import { Hint, Section } from '../ui/Panel'

/**
 * The joints of the selected panels: each place where they meet other parts,
 * with every part that meets there. With one panel selected, every joint it's
 * in; with several, the joints among them. Three posts at a corner are one
 * joint, however they're reached.
 */
function selectedJoints(selected: Panel[], panels: Panel[]): Panel[][] {
  const pairs =
    selected.length === 1
      ? partPairs(panels).filter(([a, b]) => a.id === selected[0].id || b.id === selected[0].id)
      : partPairs(selected)
  const joints = new Map<string, Panel[]>()
  for (const [a, b] of pairs) {
    const group = sharedBox(a, b) ? jointGroup(panels, a, b) : [a, b]
    const key = group
      .map((p) => p.id)
      .sort()
      .join(',')
    if (!joints.has(key)) joints.set(key, group)
  }
  return [...joints.values()]
}

/** A joint in a few words: a pair's cut, or how many of a group's are cut. */
function summary(parts: Panel[]): string {
  if (parts.length === 2) {
    const [a, b] = parts
    return sharedBox(a, b) ? describeJoint(a, b) : `${describeJoint(a, b)} (not touching now)`
  }
  const post = readCorner(parts)
  if (post) return `Corner: ${post.name} runs through`
  const pairs = partPairs(parts)
  const cut = pairs.filter(([a, b]) => readJoint(a, b).kind !== 'butt').length
  return cut === 0 ? 'Not cut: they overlap' : `${cut} of ${pairs.length} pairs cut`
}

/**
 * The joints of the selected panels, one line each saying how it's cut.
 * Clicking one opens the joint editor (see joints/JointEditor), as does
 * clicking a joint's marker in the viewport.
 */
export function JointsPanel() {
  const selected = useDesignStore(useShallow((s) => s.panels.filter((p) => s.selectedIds.includes(p.id))))
  const panels = useDesignStore((s) => s.panels)
  const setJointEditor = useDesignStore((s) => s.setJointEditor)

  if (selected.length === 0) return null
  const joints = selectedJoints(selected, panels)
  if (joints.length === 0) return null

  return (
    <Section title="Joints">
      <Hint className="mb-1.5">Where parts overlap, pick which one keeps the wood. Click a joint to open it.</Hint>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {joints.map((parts) => (
          <li key={parts.map((p) => p.id).join(',')}>
            <button
              type="button"
              onClick={() => setJointEditor(parts.map((p) => p.id))}
              className="flex w-full cursor-pointer items-center gap-2 rounded border border-edge bg-surface px-2 py-1.5 text-left transition-colors hover:border-edge-strong hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="text-small block truncate text-ink">{parts.map((p) => p.name).join(' × ')}</span>
                <span className="text-micro block truncate text-ink-dim">{summary(parts)}</span>
              </span>
              <span className="text-micro shrink-0 text-accent">Edit</span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  )
}
