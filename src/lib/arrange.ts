import type { Panel } from '../types/panel'
import { panelBounds } from './bounds'
import type { PanelPatch } from './resize'

type AxisIndex = 0 | 1 | 2

/**
 * Space `panels` evenly along world `axis`: the two outermost (by centre)
 * stay put and the ones between move so every gap between neighbours is the
 * same, edge to edge — parts of different sizes get the same clear space.
 * Where they don't fit between the outer two without overlapping, their
 * centres are spaced evenly instead. Order along the axis is kept. Fewer than
 * three panels have nothing to space.
 */
export function distributePanels(panels: Panel[], axis: AxisIndex): PanelPatch[] {
  if (panels.length < 3) return []
  const sorted = panels
    .map((panel) => ({ panel, box: panelBounds(panel) }))
    .sort((a, b) => a.box.min[axis] + a.box.max[axis] - (b.box.min[axis] + b.box.max[axis]))
  const size = (box: { min: number[]; max: number[] }) => box.max[axis] - box.min[axis]
  const start = sorted[0].box.min[axis]
  const end = sorted[sorted.length - 1].box.max[axis]
  const gap = (end - start - sorted.reduce((sum, s) => sum + size(s.box), 0)) / (sorted.length - 1)
  const centre = (box: { min: number[]; max: number[] }) => (box.min[axis] + box.max[axis]) / 2

  const patches: PanelPatch[] = []
  if (gap < 0) {
    const first = centre(sorted[0].box)
    const step = (centre(sorted[sorted.length - 1].box) - first) / (sorted.length - 1)
    for (const [i, { panel }] of sorted.entries()) {
      if (i === 0 || i === sorted.length - 1) continue
      const position: [number, number, number] = [...panel.position]
      position[axis] = first + step * i
      patches.push({ id: panel.id, patch: { position } })
    }
    return patches
  }
  let at = start
  for (const [i, { panel, box }] of sorted.entries()) {
    if (i > 0 && i < sorted.length - 1) {
      const position: [number, number, number] = [...panel.position]
      position[axis] = at + size(box) / 2
      patches.push({ id: panel.id, patch: { position } })
    }
    at += size(box) + gap
  }
  return patches
}

/** How far off even (mm) parts may be and still count as evenly spaced. */
const TOL = 0.5

/**
 * Why `panels` can't be spaced evenly along world `axis`, or null if they
 * can: there must be three or more, and not evenly spaced already.
 */
export function cantDistribute(panels: Panel[], axis: AxisIndex): string | null {
  const letter = 'XYZ'[axis]
  if (panels.length < 3) return 'Select three or more parts'
  const moves = distributePanels(panels, axis).some(({ id, patch }) => {
    const before = panels.find((p) => p.id === id)!.position[axis]
    return Math.abs(patch.position![axis] - before) > TOL
  })
  return moves ? null : `Already evenly spaced along ${letter}`
}
