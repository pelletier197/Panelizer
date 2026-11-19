import type { Panel } from '../types/panel'
import { panelBounds } from './bounds'
import type { PanelPatch } from './resize'

type AxisIndex = 0 | 1 | 2

/**
 * Space `panels` evenly along world `axis`: the two outermost stay put and
 * the ones between move so every gap between neighbours is the same. Order
 * along the axis is kept. Fewer than three panels have nothing to space.
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

  const patches: PanelPatch[] = []
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

/** How close (mm) parts may sit, or how far off even they may be, and still
 *  count as touching / evenly spaced. */
const TOL = 0.5

/**
 * The world axis `panels` can be spaced evenly along, or null if none: one
 * where they sit in a row, each clear of the next, and aren't evenly spaced
 * already. With more than one, the longest row wins.
 */
export function distributeAxis(panels: Panel[]): AxisIndex | null {
  if (panels.length < 3) return null
  let best: AxisIndex | null = null
  let bestSpan = 0
  for (const axis of [0, 1, 2] as AxisIndex[]) {
    const boxes = panels.map((p) => panelBounds(p)).sort((a, b) => a.min[axis] + a.max[axis] - (b.min[axis] + b.max[axis]))
    const inRow = boxes.every((b, i) => i === 0 || boxes[i - 1].max[axis] <= b.min[axis] + TOL)
    if (!inRow) continue
    const moves = distributePanels(panels, axis).some(({ id, patch }) => {
      const before = panels.find((p) => p.id === id)!.position[axis]
      return Math.abs(patch.position![axis] - before) > TOL
    })
    if (!moves) continue
    const span = boxes[boxes.length - 1].max[axis] - boxes[0].min[axis]
    if (span > bestSpan) [best, bestSpan] = [axis, span]
  }
  return best
}
