import { describe, expect, it } from 'vitest'
import type { Panel } from '../types/panel'
import { panelBounds, type Bounds } from './bounds'
import { dropCutsBy, intersectBounds, panelSolids, subtractBoxes } from './cuts'
import { jointMarkers } from './overlaps'
import {
  defaultPost,
  describeJoint,
  explodeOffsets,
  isThreeWay,
  jointGroup,
  lapAxis,
  readCorner,
  readJoint,
  setJoint,
  setLapHalf,
  setThreeWay,
} from './joints'
import type { PanelPatch } from './resize'

let seq = 0
const panel = (over: Partial<Panel> = {}): Panel => ({
  id: `p${seq++}`,
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

const box = (min: [number, number, number], max: [number, number, number]): Bounds => ({ min, max })
const volume = (boxes: Bounds[]) =>
  boxes.reduce((v, b) => v + (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]), 0)
/** The volume of `boxes` inside `region`. */
const volumeIn = (boxes: Bounds[], region: Bounds) =>
  volume(boxes.map((b) => intersectBounds(b, region)).filter((b): b is Bounds => b !== null))
const apply = (panels: Panel[], patches: PanelPatch[]) =>
  panels.map((p) => ({ ...p, ...patches.find((x) => x.id === p.id)?.patch }))

describe('subtractBoxes', () => {
  const block = box([0, 0, 0], [100, 50, 20])

  it('leaves the box alone when nothing reaches it', () => {
    expect(subtractBoxes(block, [box([200, 0, 0], [300, 50, 20])])).toEqual([block])
  })

  it('cuts a through groove into three boxes with the right volume', () => {
    const groove = box([40, -10, 10], [60, 60, 30]) // runs right across, 10 deep
    const left = subtractBoxes(block, [groove])
    expect(left).toHaveLength(3)
    expect(volume(left)).toBeCloseTo(100 * 50 * 20 - 20 * 50 * 10)
  })

  it('handles overlapping holes without taking wood out twice', () => {
    const left = subtractBoxes(block, [box([0, 0, 0], [60, 50, 20]), box([40, 0, 0], [100, 25, 20])])
    expect(volume(left)).toBeCloseTo(40 * 25 * 20)
  })

  it('removes everything when a hole covers the box', () => {
    expect(subtractBoxes(block, [box([-1, -1, -1], [101, 51, 21])])).toEqual([])
  })
})

describe('dado: a shelf into a side', () => {
  // Upright side, 18 thick, its inside face at x = 9; a shelf sunk 6 into it.
  const side = panel({ id: 'side', normal: 'x', length: 300, width: 700, position: [0, 350, 150] })
  const shelf = panel({ id: 'shelf', normal: 'y', length: 500, width: 300, position: [253, 300, 150] })

  it('reads as a butt joint before it is cut', () => {
    expect(readJoint(shelf, side)).toEqual({ kind: 'butt' })
  })

  it('cuts the shelf shape into the side, and leaves the shelf whole', () => {
    const panels = apply([side, shelf], setJoint(shelf, side, 'aIntoB'))
    expect(readJoint(panels[1], panels[0]).kind).toBe('aIntoB')
    const solids = panelSolids(panels)
    expect(volume(solids.get('side')!)).toBeCloseTo(18 * 700 * 300 - 6 * 18 * 300)
    expect(solids.get('shelf')).toHaveLength(1)
  })

  it('follows the shelf when it moves, with no change to the stored cut', () => {
    const panels = apply([side, shelf], setJoint(shelf, side, 'aIntoB'))
    const moved = panels.map((p) => (p.id === 'shelf' ? { ...p, position: [253, 500, 150] as Panel['position'] } : p))
    const groove = (ps: Panel[]) => {
      const solid = panelSolids(ps).get('side')!
      return subtractBoxes(box([3, 0, 0], [9, 700, 300]), solid) // the 6 mm the shelf is sunk
    }
    expect(groove(panels)[0].min[1]).toBeCloseTo(291)
    expect(groove(moved)[0].min[1]).toBeCloseTo(491)
  })

  it('setting a butt joint takes the cut back out', () => {
    const cut = apply([side, shelf], setJoint(shelf, side, 'aIntoB'))
    const undone = apply(cut, setJoint(cut[1], cut[0], 'butt'))
    expect(undone[0].cuts).toBeUndefined()
    expect(readJoint(undone[1], undone[0]).kind).toBe('butt')
  })
})

describe('half lap: two posts crossing', () => {
  // Two 40 × 40 posts crossing in the middle, one along X and one along Z.
  const a = panel({ id: 'a', normal: 'y', length: 600, width: 40, thickness: 40, position: [0, 20, 0] })
  const b = panel({ id: 'b', normal: 'x', length: 600, width: 40, thickness: 40, position: [0, 20, 0] })
  const cube = box([-20, 0, -20], [20, 40, 20])

  it('splits the lap through the height, the one way both posts are only as big as the joint', () => {
    expect(lapAxis(a, b)).toBe(1)
  })

  it('leaves each post half the crossing, with nothing doubled or missing', () => {
    const panels = apply([a, b], setJoint(a, b, 'lap'))
    const solids = panelSolids(panels)
    expect(volumeIn(solids.get('a')!, cube)).toBeCloseTo(32000)
    expect(volumeIn(solids.get('b')!, cube)).toBeCloseTo(32000)
    const doubled = solids.get('a')!.flatMap((x) => solids.get('b')!.map((y) => intersectBounds(x, y)))
    expect(doubled.filter(Boolean)).toEqual([])
    // Dead centre, the first post keeps the top half.
    expect(volumeIn(solids.get('a')!, box([-20, 20, -20], [20, 40, 20]))).toBeCloseTo(32000)
  })

  it('flips which post keeps the top', () => {
    const lapped = apply([a, b], setJoint(a, b, 'lap'))
    const joint = readJoint(lapped[0], lapped[1])
    const flipped = apply(lapped, setLapHalf(lapped[0], lapped[1], { ...joint.half!, side: 1 }))
    expect(volumeIn(panelSolids(flipped).get('b')!, box([-20, 20, -20], [20, 40, 20]))).toBeCloseTo(32000)
  })
})

describe('3-way corner: a post and two rails', () => {
  // A table corner, 40 × 40 stock meeting in the cube [0, 40]³: the post runs
  // down from it, one rail out along X, the other out along Z.
  const post = panel({ id: 'post', normal: 'z', length: 40, width: 700, thickness: 40, position: [20, -310, 20] })
  const railX = panel({ id: 'railX', normal: 'y', length: 500, width: 40, thickness: 40, position: [250, 20, 20] })
  const railZ = panel({ id: 'railZ', normal: 'x', length: 500, width: 40, thickness: 40, position: [20, 20, 250] })
  const cube = box([0, 0, 0], [40, 40, 40])
  const panels = [post, railX, railZ]

  it('is recognised, with the upright as the post', () => {
    expect(isThreeWay(panels)).toBe(true)
    expect(defaultPost([railX, post, railZ]).id).toBe('post')
  })

  it('keeps a quarter of the post through the corner, at the outside corner', () => {
    const solids = panelSolids(apply(panels, setThreeWay(post, [railX, railZ])))
    expect(volumeIn(solids.get('post')!, cube)).toBeCloseTo(16000)
    // The quarter left is the one on the outer faces (x < 20, z < 20).
    expect(volumeIn(solids.get('post')!, box([0, 0, 0], [20, 40, 20]))).toBeCloseTo(16000)
  })

  it('fills the corner exactly: the three pieces add up to the cube and never share wood', () => {
    const solids = panelSolids(apply(panels, setThreeWay(post, [railX, railZ])))
    const pieces = ['post', 'railX', 'railZ'].map((id) => solids.get(id)!)
    expect(pieces.reduce((v, s) => v + volumeIn(s, cube), 0)).toBeCloseTo(64000)
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        const shared = pieces[i].flatMap((x) => pieces[j].map((y) => intersectBounds(x, y)))
        expect(shared.filter(Boolean)).toEqual([])
      }
    }
  })

  it('reads each pair as a lap', () => {
    const cut = apply(panels, setThreeWay(post, [railX, railZ]))
    expect(readJoint(cut[0], cut[1]).kind).toBe('lap')
    expect(readJoint(cut[0], cut[2]).kind).toBe('lap')
    expect(readJoint(cut[1], cut[2]).kind).toBe('lap')
  })
})

describe('loops and removal', () => {
  it('survives two panels each cut by the whole of the other', () => {
    const a = panel({ id: 'la', cuts: [{ by: 'lb' }] })
    const b = panel({ id: 'lb', position: [100, 0, 9], cuts: [{ by: 'la' }] })
    const solids = panelSolids([a, b])
    expect(solids.size).toBe(2)
  })

  it('drops cuts made by a panel that is deleted', () => {
    const a = panel({ id: 'da', cuts: [{ by: 'db' }, { by: 'dc' }] })
    const [after] = dropCutsBy([a], new Set(['db']))
    expect(after.cuts).toEqual([{ by: 'dc' }])
    expect(dropCutsBy([after], new Set(['dc']))[0]).not.toHaveProperty('cuts')
  })
})

describe('a corner whose cuts chain round through other parts', () => {
  // A panel filling exactly [min, max] (thickness along Z).
  const block = (id: string, min: [number, number, number], max: [number, number, number], cuts?: Panel['cuts']): Panel => {
    const size = [0, 1, 2].map((k) => max[k] - min[k])
    const position = [0, 1, 2].map((k) => (min[k] + max[k]) / 2) as [number, number, number]
    const tryIt = (length: number, width: number) => panel({ id, normal: 'z', length, width, thickness: size[2], position, cuts })
    const a = tryIt(size[0], size[1])
    return panelBounds(a).max[0] - panelBounds(a).min[0] === size[0] ? a : tryIt(size[1], size[0])
  }

  it('leaves each rail its share, however the chain comes back to the post', () => {
    // Post up Y, rails along X and Z, meeting in the 40 mm cube at the origin.
    const post = block('kp', [0, -700, 0], [40, 40, 40])
    const railX = block('kx', [0, 0, 0], [500, 40, 40])
    const railZ = block('kz', [0, 0, 0], [40, 40, 500])
    let parts = apply([post, railX, railZ], setThreeWay(post, [railX, railZ]))
    // Two more parts, clear of the corner, that close a loop of whole-shape
    // cuts: post ← a ← b ← rail X ← post.
    const a = block('ka', [30, -300, 10], [200, -200, 30], [{ by: 'kb' }])
    const b = block('kb', [150, -250, 10], [190, 20, 30], [{ by: 'kx' }])
    parts = parts.map((p) => (p.id === 'kp' ? { ...p, cuts: [...(p.cuts ?? []), { by: 'ka' }] } : p))
    // The post first, so the loop is met coming back round to it.
    const solids = panelSolids([parts[0], a, b, ...parts.slice(1)])
    const cube = box([0, 0, 0], [40, 40, 40])
    const share = (id: string) => volumeIn(solids.get(id)!, cube) / 64000
    expect(share('kp')).toBeCloseTo(0.25)
    expect(share('kx')).toBeCloseTo(0.375)
    expect(share('kz')).toBeCloseTo(0.375)
  })

  it("ignores a cut by a part that doesn't touch the panel", () => {
    const lone = block('kl', [0, 0, 0], [10, 10, 10], [{ by: 'kf' }])
    const far = block('kf', [100, 100, 100], [110, 110, 110], [{ by: 'kl' }])
    expect(volume(panelSolids([lone, far]).get('kl')!)).toBeCloseTo(1000)
  })
})

describe('explodeOffsets: pulling a joint apart to show its pieces', () => {
  it('lifts the post keeping the top of a lap, and drops the other', () => {
    const a = panel({ id: 'xa', normal: 'y', length: 600, width: 40, thickness: 40, position: [0, 20, 0] })
    const b = panel({ id: 'xb', normal: 'x', length: 600, width: 40, thickness: 40, position: [0, 20, 0] })
    const panels = apply([a, b], setJoint(a, b, 'lap'))
    const offsets = explodeOffsets(panels, ['xa', 'xb'], panelSolids(panels))
    expect(offsets.get('xa')![1]).toBeGreaterThan(0)
    expect(offsets.get('xb')![1]).toBeLessThan(0)
  })

  it('draws a shelf out of its dado, away from the side', () => {
    const side = panel({ id: 'es', normal: 'x', length: 300, width: 700, position: [0, 350, 150] })
    const shelf = panel({ id: 'eh', normal: 'y', length: 500, width: 300, position: [253, 300, 150] })
    const panels = apply([side, shelf], setJoint(shelf, side, 'aIntoB'))
    const offsets = explodeOffsets(panels, ['es', 'eh'], panelSolids(panels))
    expect(offsets.get('eh')![0]).toBeGreaterThan(0)
    expect(offsets.get('es')![0]).toBeLessThan(0)
  })

  // Every piece moved by its offset: no two may still share wood.
  const sharesWood = (panels: Panel[], ids: string[]) => {
    const solids = panelSolids(panels)
    const offsets = explodeOffsets(panels, ids, solids)
    const moved = ids.map((id) =>
      solids.get(id)!.map((b) => {
        const o = offsets.get(id)!
        return box(b.min.map((v, k) => v + o[k]) as [number, number, number], b.max.map((v, k) => v + o[k]) as [number, number, number])
      }),
    )
    return moved.some((a, i) =>
      moved.slice(i + 1).some((b) => a.some((x) => b.some((y) => intersectBounds(x, y) !== null))),
    )
  }

  it('pulls an uncut corner of thick posts far enough apart that nothing overlaps', () => {
    // Three 76 mm posts meeting at a corner, nothing cut: the overlap is as
    // deep as the posts are thick.
    const up = panel({ id: 'cu', normal: 'z', length: 76, width: 800, thickness: 76, position: [38, 400, 38] })
    const along = panel({ id: 'ca', normal: 'y', length: 800, width: 76, thickness: 76, position: [400, 38, 38] })
    const back = panel({ id: 'cb', normal: 'x', length: 800, width: 76, thickness: 76, position: [38, 38, 400] })
    expect(sharesWood([up, along, back], ['cu', 'ca', 'cb'])).toBe(false)
  })

  it('pulls an uncut pair apart, and a long dado no further than its middle size calls for', () => {
    const side = panel({ id: 'us', normal: 'x', length: 300, width: 700, position: [0, 350, 150] })
    const shelf = panel({ id: 'uh', normal: 'y', length: 500, width: 300, position: [240, 300, 150] })
    const panels = [side, shelf]
    expect(sharesWood(panels, ['us', 'uh'])).toBe(false)
    // The joint is 300 long but only 18 by 9 across; the pieces stay close.
    const offsets = explodeOffsets(panels, ['us', 'uh'], panelSolids(panels))
    expect(Math.hypot(...offsets.get('uh')!)).toBeLessThan(100)
  })
})

describe('reading joints back for the editor', () => {
  const post = panel({ id: 'rp', name: 'Post', normal: 'z', length: 40, width: 700, thickness: 40, position: [20, -310, 20] })
  const railX = panel({ id: 'rx', name: 'Rail X', normal: 'y', length: 500, width: 40, thickness: 40, position: [250, 20, 20] })
  const railZ = panel({ id: 'rz', name: 'Rail Z', normal: 'x', length: 500, width: 40, thickness: 40, position: [20, 20, 250] })

  it('finds the third part of a corner, and which part runs through once cut', () => {
    expect(jointGroup([post, railX, railZ], post, railX).map((p) => p.id)).toEqual(['rp', 'rx', 'rz'])
    expect(readCorner([post, railX, railZ])).toBeNull()
    const cut = apply([post, railX, railZ], setThreeWay(post, [railX, railZ]))
    expect(readCorner(cut)?.id).toBe('rp')
  })

  it("keeps a panel set in grooves apart from the corner it only grazes", () => {
    // A table corner in 3" stock, with a 3/4" side panel let into the leg and
    // the top rail along their length: it reaches into the corner by a
    // sliver at the top of the leg, but that's not the corner joint.
    const leg = panel({ id: 'leg', normal: 'x', length: 76.2, width: 863.6, thickness: 76.2, position: [-44.45, 466.725, 0] })
    const top = panel({ id: 'top', normal: 'y', length: 863.6, width: 76.2, thickness: 76.2, position: [349.25, 860.425, 0] })
    const front = panel({ id: 'front', normal: 'y', length: 76.2, width: 863.6, thickness: 76.2, position: [-44.45, 860.425, -393.7] })
    const side = panel({ id: 'side', normal: 'z', length: 800.1, width: 733.425, thickness: 19.05, position: [379.975, 468.675, -28.575] })
    const all = [leg, top, front, side]
    const ids = (a: Panel, b: Panel) => jointGroup(all, a, b).map((p) => p.id)
    expect(ids(leg, top)).toEqual(['leg', 'top', 'front'])
    expect(ids(side, leg)).toEqual(['side', 'leg'])
    expect(ids(side, top)).toEqual(['side', 'top'])
    // Where the side's corner pokes into the front rail, all four claim the
    // same small block: that spot is a joint of four.
    expect(ids(side, front)).toEqual(['side', 'front', 'leg', 'top'])
  })

  it('says who keeps the overlap in words', () => {
    const side = panel({ id: 'ds', name: 'Side', normal: 'x', length: 300, width: 700, position: [0, 350, 150] })
    const shelf = panel({ id: 'dh', name: 'Shelf', normal: 'y', length: 500, width: 300, position: [253, 300, 150] })
    expect(describeJoint(shelf, side)).toBe('Not cut: they overlap')
    const [cutSide, cutShelf] = apply([side, shelf], setJoint(shelf, side, 'aIntoB'))
    expect(describeJoint(cutShelf, cutSide)).toBe('Side is notched for Shelf')
  })

  it('marks each joint once, cut or not, and leaves hidden parts out', () => {
    const cut = apply([post, railX, railZ], setThreeWay(post, [railX, railZ]))
    expect(jointMarkers(cut).map((m) => m.cut)).toEqual([true])
    expect(jointMarkers([post, railX, railZ]).map((m) => m.cut)).toEqual([false])
    expect(jointMarkers([post, { ...railX, hidden: true }, railZ])).toHaveLength(1)
  })
})
