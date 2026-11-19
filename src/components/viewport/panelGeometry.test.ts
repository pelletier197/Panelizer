import { describe, expect, it } from 'vitest'
import type { BufferGeometry } from 'three'
import type { Panel } from '../../types/panel'
import { localSolid, panelSolids } from '../../lib/cuts'
import { setJoint, setThreeWay } from '../../lib/joints'
import type { PanelPatch } from '../../lib/resize'
import { cutPanelGeometry, roundedPanelGeometry } from './panelGeometry'

const panel = (over: Partial<Panel>): Panel => ({
  id: 'p',
  name: 'Part',
  normal: 'z',
  length: 600,
  width: 400,
  thickness: 18,
  position: [0, 0, 0],
  materialId: 'ply',
  grain: 'length',
  ...over,
})
const apply = (panels: Panel[], patches: PanelPatch[]) =>
  panels.map((p) => ({ ...p, ...patches.find((x) => x.id === p.id)?.patch }))

/**
 * The volume a mesh encloses (mm³), by summing the signed tetrahedra each
 * triangle makes with the origin. Only a closed mesh with every face turned
 * outward gives the solid's true volume, so this checks both at once.
 */
function enclosed(geometry: BufferGeometry): number {
  const p = geometry.getAttribute('position')
  let sum = 0
  for (let i = 0; i < p.count; i += 3) {
    const [a, b, c] = [i, i + 1, i + 2].map((j) => [p.getX(j), p.getY(j), p.getZ(j)].map((x) => x * 1000))
    sum += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
  }
  return sum / 6
}

describe('cutPanelGeometry', () => {
  it('closes a grooved side, faces out', () => {
    const side = panel({ id: 'side', normal: 'x', length: 300, width: 700, position: [0, 350, 150] })
    const shelf = panel({ id: 'shelf', normal: 'y', length: 500, width: 300, position: [253, 300, 150] })
    const panels = apply([side, shelf], setJoint(shelf, side, 'aIntoB'))
    const geometry = cutPanelGeometry(panels[0], localSolid(panels[0], panelSolids(panels).get('side'))!)
    expect(enclosed(geometry)).toBeCloseTo(18 * 700 * 300 - 6 * 18 * 300, -1)
  })

  it('keeps rounded corners round on a cut panel', () => {
    const r = 50
    const top = panel({ id: 'top', normal: 'y', length: 600, width: 400, corners: [r, r, r, r], position: [0, 0, 0] })
    // A 10 × 10 rabbet along one long edge, clear of the rounded ends.
    const strip = panel({ id: 'strip', normal: 'y', length: 400, width: 10, thickness: 10, position: [0, 4, 195] })
    const panels = apply([top, strip], setJoint(strip, top, 'aIntoB'))
    const geometry = cutPanelGeometry(panels[0], localSolid(panels[0], panelSolids(panels).get('top'))!)
    // The same outline as the uncut panel, less the rabbet.
    const whole = enclosed(roundedPanelGeometry(top)!)
    expect(whole).toBeCloseTo((600 * 400 - (4 - Math.PI) * r * r) * 18, -4) // straight pieces, not true arcs
    expect(enclosed(geometry)).toBeCloseTo(whole - 400 * 10 * 10, -1)
  })

  it('builds each piece of a 3-way corner closed', () => {
    const post = panel({ id: 'post', normal: 'z', length: 40, width: 700, thickness: 40, position: [20, -310, 20] })
    const railX = panel({ id: 'railX', normal: 'y', length: 500, width: 40, thickness: 40, position: [250, 20, 20] })
    const railZ = panel({ id: 'railZ', normal: 'x', length: 500, width: 40, thickness: 40, position: [20, 20, 250] })
    const panels = apply([post, railX, railZ], setThreeWay(post, [railX, railZ]))
    const solids = panelSolids(panels)
    const total = panels.reduce((v, p) => v + enclosed(cutPanelGeometry(p, localSolid(p, solids.get(p.id))!)), 0)
    expect(total).toBeCloseTo(40 * 40 * (700 + 500 + 500) - 2 * 40 ** 3, -1)
  })
})
