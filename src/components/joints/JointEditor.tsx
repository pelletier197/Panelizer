import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Html, OrbitControls } from '@react-three/drei'
import { BoxGeometry, type Group, type PerspectiveCamera } from 'three'
import type { Cut, Panel } from '../../types/panel'
import type { Bounds } from '../../lib/bounds'
import type { PanelPatch } from '../../lib/resize'
import { SIDE_NAMES, toMetres } from '../../lib/geometry'
import { intersectBounds, localSolid, panelSolids } from '../../lib/cuts'
import {
  defaultPost,
  explodeOffsets,
  isThreeWay,
  lapAxis,
  lapHalf,
  partPairs,
  readCorner,
  readJoint,
  setJoint,
  setLapHalf,
  setThreeWay,
  sharedBox,
} from '../../lib/joints'
import { useDesignStore } from '../../store/designStore'
import { useEscapeToClose } from '../panels/cutlist/useCutlistModel'
import { panelGeometry } from '../viewport/panelGeometry'
import { HeadLight } from '../viewport/HeadLight'
import { palette } from '../viewport/palette'
import { Button } from '../ui/Button'
import { CONTROL } from '../ui/Field'
import { cx } from '../ui/cx'

type Vec3 = [number, number, number]

/** One colour per part, so each piece reads as itself in the close-up and its
 *  button says which one it is. */
const PART_COLORS = ['#5b8def', '#f0a03c', '#45b97c', '#d9608f', '#9b7be0', '#3cbcc4', '#e0574a', '#d6c13f']

/** The ways a split can run, by the halves each part ends up with. */
const SPLITS: { axis: 0 | 1 | 2; label: string }[] = [
  { axis: 1, label: 'Top / bottom' },
  { axis: 2, label: 'Front / back' },
  { axis: 0, label: 'Left / right' },
]

/**
 * The joint editor: a close-up of the parts that meet, each in its own
 * colour and pulled a little apart, and one question — who keeps the wood
 * where they overlap? Changes show in the close-up as they're picked and only
 * reach the design on Done, as one undo step.
 */
export function JointEditor() {
  const ids = useDesignStore((s) => s.jointEditor)
  const setJointEditor = useDesignStore((s) => s.setJointEditor)
  useEscapeToClose(ids !== null, () => setJointEditor(null))
  if (!ids) return null
  // Keyed by the parts, so opening another joint starts a fresh draft.
  return <Editor key={ids.join(',')} ids={ids} onClose={() => setJointEditor(null)} />
}

function Editor({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const panels = useDesignStore((s) => s.panels)
  const commitPanelPatches = useDesignStore((s) => s.commitPanelPatches)
  // The pair whose row is under the pointer: the close-up fades the rest.
  const [focus, setFocus] = useState<string[] | null>(null)
  // For a corner: the one-click way, or each pair on its own. Opens on pairs
  // when they've been cut some other way, so those cuts are what's shown.
  const [tab, setTab] = useState<'corner' | 'pairs'>(() => {
    const opened = panels.filter((p) => ids.includes(p.id))
    const cut = partPairs(opened).some(([a, b]) => readJoint(a, b).kind !== 'butt')
    return !cut || readCorner(opened) ? 'corner' : 'pairs'
  })

  // The cuts being tried out, per part; the design keeps its own until Done.
  const [draft, setDraft] = useState(() => new Map(panels.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.cuts])))
  const withDraft = (p: Panel): Panel => (draft.has(p.id) ? { ...p, cuts: draft.get(p.id) } : p)
  const all = panels.map(withDraft)
  const parts = ids.map((id) => all.find((p) => p.id === id)).filter((p): p is Panel => p !== undefined)
  const apply = (patches: PanelPatch[]) =>
    setDraft((d) => {
      const next = new Map(d)
      patches.forEach(({ id, patch }) => 'cuts' in patch && next.set(id, patch.cuts as Cut[] | undefined))
      return next
    })

  const done = () => {
    const changed = parts.filter((p) => panels.find((q) => q.id === p.id)?.cuts !== p.cuts)
    if (changed.length > 0) commitPanelPatches(changed.map((p) => ({ id: p.id, patch: { cuts: p.cuts } })))
    onClose()
  }

  if (parts.length < 2) return null
  // Three parts that all meet can be cut as a corner in one go.
  const corner = parts.length === 3 && isThreeWay(parts)
  const color =(p: Panel) => PART_COLORS[parts.indexOf(p) % PART_COLORS.length]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Joint"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 print:hidden"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-edge bg-surface shadow-2xl">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-edge px-4">
          <h2 className="m-0 flex min-w-0 flex-1 items-center gap-2 truncate text-base font-semibold">
            Joint:
            {parts.map((p, i) => (
              <span key={p.id} className="flex min-w-0 items-center gap-1.5 font-normal">
                {i > 0 && <span className="text-ink-faint">×</span>}
                <Dot color={color(p)} />
                <span className="truncate">{p.name}</span>
              </span>
            ))}
          </h2>
          <Button variant="ghost" icon aria-label="Close" title="Close (Esc)" onClick={onClose}>
            ✕
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <CloseUp parts={parts} all={all} color={color} focus={focus} />
          <div className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-t border-edge p-4 md:w-80 md:border-t-0 md:border-l">
            {parts.length === 2 ? (
              <PairChoices a={parts[0]} b={parts[1]} color={color} onApply={apply} />
            ) : (
              <>
                {corner && (
                  <div className="flex gap-1 rounded bg-bg p-1" role="tablist" aria-label="How to cut the joint">
                    {(
                      [
                        ['corner', 'Corner'],
                        ['pairs', 'Pair by pair'],
                      ] as const
                    ).map(([id, label]) => (
                      <Button
                        key={id}
                        size="sm"
                        role="tab"
                        aria-selected={tab === id}
                        className="flex-1"
                        variant={tab === id ? 'primary' : 'ghost'}
                        onClick={() => setTab(id)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
                {corner && tab === 'corner' ? (
                  <CornerChoices parts={parts} color={color} onApply={apply} />
                ) : (
                  <PairList parts={parts} color={color} onApply={apply} onFocus={setFocus} />
                )}
              </>
            )}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-edge px-4 py-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={done}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />
}

/** A big choice button: a colour dot, a name, and a line on what it does. */
function Choice({
  active,
  color,
  title,
  detail,
  onClick,
}: {
  active: boolean
  color?: string
  title: string
  detail: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'flex w-full cursor-pointer items-start gap-2 rounded border px-2.5 py-2 text-left transition-colors',
        active ? 'border-accent bg-accent/15' : 'border-edge bg-bg hover:border-edge-strong hover:bg-surface-2',
      )}
    >
      <span className="mt-1">{color ? <Dot color={color} /> : <span className="inline-block size-2.5" />}</span>
      <span className="min-w-0">
        <span className="text-small block font-medium text-ink">{title}</span>
        <span className="text-micro block text-ink-dim">{detail}</span>
      </span>
    </button>
  )
}

function PairChoices({
  a,
  b,
  color,
  onApply,
}: {
  a: Panel
  b: Panel
  color: (p: Panel) => string
  onApply: (patches: PanelPatch[]) => void
}) {
  const joint = readJoint(a, b)
  const split = joint.kind === 'lap' && joint.half ? joint.half : null

  // Which part keeps which half of a split, in words.
  let splitText = ''
  if (split) {
    const [loser, keeper] = joint.halfOn === 'a' ? [a, b] : [b, a]
    const kept = SIDE_NAMES[split.axis][split.side > 0 ? 0 : 1]
    const given = SIDE_NAMES[split.axis][split.side > 0 ? 1 : 0]
    splitText = `${loser.name} keeps the ${kept} half, ${keeper.name} the ${given}.`
  }
  const turnSplit = (axis: 0 | 1 | 2) => {
    const [host, by] = joint.halfOn === 'a' ? [a, b] : [b, a]
    onApply(setLapHalf(a, b, lapHalf(host, by, axis)))
  }

  return (
    <>
      <div>
        <h3 className="text-small m-0 font-semibold text-ink">Who keeps the overlap?</h3>
        <p className="text-micro m-0 mt-1 text-ink-dim">
          Where two parts overlap, the wood can only go to one of them. The other is cut away where it passes.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Choice
          active={joint.kind === 'aIntoB'}
          color={color(a)}
          title={a.name}
          detail={`${b.name} gets a notch or groove for it`}
          onClick={() => onApply(setJoint(a, b, 'aIntoB'))}
        />
        <Choice
          active={joint.kind === 'bIntoA'}
          color={color(b)}
          title={b.name}
          detail={`${a.name} gets a notch or groove for it`}
          onClick={() => onApply(setJoint(a, b, 'bIntoA'))}
        />
        <Choice
          active={joint.kind === 'lap'}
          title="Half each"
          detail="Each is cut halfway, so they fit together (a half lap)"
          onClick={() => joint.kind !== 'lap' && onApply(setJoint(a, b, 'lap', lapHalf(a, b, lapAxis(a, b))))}
        />
        <Choice
          active={joint.kind === 'butt' || joint.kind === 'custom'}
          title={joint.kind === 'custom' ? 'Custom cuts' : 'No cut'}
          detail="Leave them overlapping"
          onClick={() => onApply(setJoint(a, b, 'butt'))}
        />
      </div>

      {split && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-micro m-0 font-semibold tracking-wide text-ink-dim uppercase">Split</h4>
          <div className="flex gap-1">
            {SPLITS.map(({ axis, label }) => (
              <Button
                key={axis}
                size="sm"
                className="flex-1 px-1"
                variant={split.axis === axis ? 'primary' : 'default'}
                aria-pressed={split.axis === axis}
                onClick={() => split.axis !== axis && turnSplit(axis)}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-micro min-w-0 flex-1 text-ink-dim">{splitText}</span>
            <Button
              size="sm"
              title="Swap which half each part keeps"
              onClick={() => onApply(setLapHalf(a, b, { ...split, side: split.side > 0 ? -1 : 1 }))}
            >
              Swap
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

function CornerChoices({
  parts,
  color,
  onApply,
}: {
  parts: Panel[]
  color: (p: Panel) => string
  onApply: (patches: PanelPatch[]) => void
}) {
  const post = readCorner(parts)
  const cut = parts.some((p) => parts.some((q) => q !== p && (p.cuts ?? []).some((c) => c.by === q.id)))
  // Back to no cuts between the three, keeping their joints with anything else.
  const uncut = () =>
    onApply(
      parts.map((p) => {
        const cuts = (p.cuts ?? []).filter((c) => !parts.some((q) => q.id === c.by))
        return { id: p.id, patch: { cuts: cuts.length > 0 ? cuts : undefined } }
      }),
    )

  return (
    <>
      <div>
        <h3 className="text-small m-0 font-semibold text-ink">Which part runs through?</h3>
        <p className="text-micro m-0 mt-1 text-ink-dim">
          It gives up half its wood to each of the others and keeps a quarter through the corner; the other two
          share the rest, half each. For any other mix, use Pair by pair.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {[...parts]
          .sort((p, q) => (p === defaultPost(parts) ? -1 : q === defaultPost(parts) ? 1 : 0))
          .map((p) => (
            <Choice
              key={p.id}
              active={post?.id === p.id}
              color={color(p)}
              title={p.name}
              detail={`${p.name} runs through; the others are notched around it`}
              onClick={() => {
                const rails = parts.filter((q) => q !== p) as [Panel, Panel]
                onApply(setThreeWay(p, rails))
              }}
            />
          ))}
        <Choice
          active={!cut}
          title={cut && !post ? 'Custom cuts' : 'No cut'}
          detail="Leave them overlapping"
          onClick={uncut}
        />
      </div>
    </>
  )
}

/**
 * Every pair in a joint of three or more parts, each with the same question
 * as a joint of two — who keeps the wood where these two overlap? — for when
 * the parts don't make a simple corner (a cabinet's side, top and back) or a
 * pair should be cut some other way. Pointing at a row fades the other parts
 * in the close-up.
 */
function PairList({
  parts,
  color,
  onApply,
  onFocus,
}: {
  parts: Panel[]
  color: (p: Panel) => string
  onApply: (patches: PanelPatch[]) => void
  onFocus: (ids: string[] | null) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <h3 className="text-small m-0 font-semibold text-ink">Pair by pair</h3>
        <p className="text-micro m-0 mt-1 text-ink-dim">Where each two overlap, who keeps the wood?</p>
      </div>
      {partPairs(parts).map(([a, b]) => {
        const joint = readJoint(a, b)
        const split = joint.kind === 'lap' && joint.half ? joint.half : null
        const options: { kind: 'aIntoB' | 'bIntoA' | 'lap' | 'butt'; label: string; dot?: string; title: string }[] = [
          { kind: 'aIntoB', label: a.name, dot: color(a), title: `${a.name} keeps it; ${b.name} is notched` },
          { kind: 'bIntoA', label: b.name, dot: color(b), title: `${b.name} keeps it; ${a.name} is notched` },
          { kind: 'lap', label: 'Half', title: 'Half each (a half lap)' },
          { kind: 'butt', label: 'None', title: 'No cut: leave them overlapping' },
        ]
        return (
          <div
            key={`${a.id}:${b.id}`}
            className="rounded border border-edge bg-bg px-2 py-1.5"
            onPointerEnter={() => onFocus([a.id, b.id])}
            onPointerLeave={() => onFocus(null)}
          >
            <div className="text-micro mb-1 flex items-center gap-1.5 text-ink-dim">
              <Dot color={color(a)} />
              <span className="truncate">{a.name}</span>
              <span className="text-ink-faint">×</span>
              <Dot color={color(b)} />
              <span className="truncate">{b.name}</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {options.map(({ kind, label, dot, title }) => (
                <Button
                  key={kind}
                  size="sm"
                  title={title}
                  className="min-w-0 px-1"
                  variant={joint.kind === kind ? 'primary' : 'default'}
                  aria-pressed={joint.kind === kind}
                  onClick={() => joint.kind !== kind && onApply(setJoint(a, b, kind))}
                >
                  {dot && <Dot color={dot} />}
                  <span className="truncate">{label}</span>
                </Button>
              ))}
            </div>
            {split && (
              <div className="mt-1 flex items-center gap-1">
                <select
                  className={cx(CONTROL, 'text-micro py-0.5')}
                  aria-label="Split"
                  value={split.axis}
                  onChange={(e) => {
                    const axis = Number(e.target.value) as 0 | 1 | 2
                    const [host, by] = joint.halfOn === 'a' ? [a, b] : [b, a]
                    onApply(setLapHalf(a, b, lapHalf(host, by, axis, parts)))
                  }}
                >
                  {SPLITS.map(({ axis, label }) => (
                    <option key={axis} value={axis}>
                      {label}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  title="Swap which half each part keeps"
                  onClick={() => onApply(setLapHalf(a, b, { ...split, side: split.side > 0 ? -1 : 1 }))}
                >
                  Swap
                </Button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * The parts up close, in their colours and as they'd be cut, fitted together
 * (or pulled a little apart from the joint, to see each piece). Turn it with
 * the mouse or a finger; the joint's outline stays where the parts overlap.
 * The camera frames the joint itself, and backs off to fit the pieces while
 * they're apart.
 */
function CloseUp({
  parts,
  all,
  color,
  focus,
}: {
  parts: Panel[]
  all: Panel[]
  color: (p: Panel) => string
  focus: string[] | null
}) {
  const [apart, setApart] = useState(false)
  const paint = palette()

  const scene = useMemo(() => {
    const solids = panelSolids(all)
    const ids = parts.map((p) => p.id)
    const offsets = explodeOffsets(all, ids, solids)
    const shared = parts
      .flatMap((a, i) => parts.slice(i + 1).map((b) => sharedBox(a, b)))
      .filter((b): b is Bounds => b !== null)
    if (shared.length === 0) return null
    const joint: Bounds = {
      min: [0, 1, 2].map((k) => Math.min(...shared.map((b) => b.min[k]))) as Vec3,
      max: [0, 1, 2].map((k) => Math.max(...shared.map((b) => b.max[k]))) as Vec3,
    }
    const centre = [0, 1, 2].map((k) => (joint.min[k] + joint.max[k]) / 2) as Vec3
    const size = Math.max(...[0, 1, 2].map((k) => joint.max[k] - joint.min[k]))
    // Only the wood near the joint is drawn, so a long post doesn't run off
    // into the distance and shrink the joint to a dot.
    const reach = size * 2.5
    const near: Bounds = {
      min: joint.min.map((v) => v - reach) as Vec3,
      max: joint.max.map((v) => v + reach) as Vec3,
    }
    const pieces = parts.map((p) => {
      const clipped = (solids.get(p.id) ?? [])
        .map((b) => intersectBounds(b, near))
        .filter((b): b is Bounds => b !== null)
      return {
        panel: p,
        solid: localSolid(p, clipped.length > 0 ? clipped : undefined),
        offset: offsets.get(p.id) ?? ([0, 0, 0] as Vec3),
        drawn: clipped,
      }
    })
    // What the camera fits: the joint itself with a little wood around it
    // when together; when apart, every drawn piece where it's been moved to,
    // out to its farthest corner.
    const half = Math.hypot(...[0, 1, 2].map((k) => joint.max[k] - joint.min[k])) / 2
    const together = half * 1.6 + 10
    const farthest = Math.max(
      0,
      ...pieces.flatMap(({ drawn, offset }) =>
        drawn.map((b) =>
          Math.hypot(
            ...[0, 1, 2].map((k) =>
              Math.max(Math.abs(b.min[k] + offset[k] - centre[k]), Math.abs(b.max[k] + offset[k] - centre[k])),
            ),
          ),
        ),
      ),
    )
    const apart = Math.max(together, farthest * 1.05)
    return { centre, joint, together, apart, pieces }
  }, [parts, all])

  return (
    <div className="relative h-72 min-w-0 shrink-0 bg-bg md:h-auto md:min-h-[26rem] md:flex-1">
      {scene && (
        <Canvas dpr={[1, 2]} camera={{ fov: 35, near: 0.001, far: 50, position: cameraStart(scene.together) }}>
          <CameraFit radius={apart ? scene.apart : scene.together} />
          <ambientLight intensity={0.7} />
          <HeadLight intensity={1.6} />
          {/* The scene is moved so the joint sits on the origin, where the
              camera turns and the head light points. */}
          <group position={toMetres(scene.centre.map((v) => -v) as Vec3)}>
            {scene.pieces.map(({ panel, solid, offset }) => (
              <Piece
                key={panel.id}
                panel={panel}
                solid={solid}
                offset={apart ? offset : [0, 0, 0]}
                color={color(panel)}
                label={apart}
                edge={paint.panelEdge}
                faded={focus !== null && !focus.includes(panel.id)}
              />
            ))}
            <JointOutline joint={scene.joint} color={paint.ghostEdge} />
          </group>
          <OrbitControls makeDefault enableDamping />
        </Canvas>
      )}
      <div className="absolute top-2 left-2 flex gap-1">
        <Button size="sm" variant={apart ? 'primary' : 'default'} onClick={() => setApart(true)}>
          Apart
        </Button>
        <Button size="sm" variant={apart ? 'default' : 'primary'} onClick={() => setApart(false)}>
          Together
        </Button>
      </div>
      <p className="text-micro pointer-events-none absolute bottom-2 left-2 m-0 text-ink-faint">Drag to turn · scroll to zoom</p>
    </div>
  )
}

/** Where the camera starts: up, right and in front of the joint, far enough
 *  back that everything within `radius` (mm) of it is in view. */
function cameraStart(radius: number): Vec3 {
  const d = (radius * 3.6) / 1000
  return [d * 0.6, d * 0.5, d * 0.62]
}

/** Eases the camera in or out along its line of sight until everything
 *  within `radius` (mm) of the joint fits, whenever `radius` changes. It then
 *  lets go, so zooming by hand isn't fought. */
function CameraFit({ radius }: { radius: number }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height))
  const goal = useRef<number | null>(null)
  useEffect(() => {
    // Fit the sphere in the narrower of the two fields of view, so a tall,
    // thin view (a phone) doesn't crop the sides.
    const vertical = (camera.fov * Math.PI) / 360
    const horizontal = Math.atan(Math.tan(vertical) * aspect)
    goal.current = radius / 1000 / Math.sin(Math.min(vertical, horizontal))
  }, [radius, aspect, camera])
  useFrame((_, delta) => {
    if (goal.current === null) return
    const now = camera.position.length()
    const next = now + (goal.current - now) * Math.min(1, delta * 8)
    camera.position.setLength(next)
    if (Math.abs(next - goal.current) < goal.current * 0.002) goal.current = null
  })
  return null
}

/** One part in the close-up: its own colour, sliding to its spot. */
function Piece({
  panel,
  solid,
  offset,
  color,
  label,
  edge,
  faded,
}: {
  panel: Panel
  solid: Bounds[] | null
  offset: Vec3
  color: string
  label: boolean
  edge: string
  /** Stepped back while another pair is being looked at. */
  faded: boolean
}) {
  const geometry = useMemo(() => panelGeometry(panel, solid), [panel, solid])
  useEffect(() => () => geometry.dispose(), [geometry])
  const group = useRef<Group>(null!)
  const target = toMetres(panel.position.map((v, k) => v + offset[k]) as Vec3)

  // Ease towards where it should be, so pulling apart and putting together
  // read as movement rather than a jump.
  useFrame((_, delta) => {
    const g = group.current.position
    const t = Math.min(1, delta * 8)
    g.set(g.x + (target[0] - g.x) * t, g.y + (target[1] - g.y) * t, g.z + (target[2] - g.z) * t)
  })

  // The name goes beside the piece, out along the way it was pulled.
  const length = Math.hypot(...offset)
  const tag = length > 0 ? (offset.map((d) => (d / length) * (length + 25)) as Vec3) : ([0, 0, 0] as Vec3)
  const nearJoint = solid ? jointSide(solid) : ([0, 0, 0] as Vec3)

  return (
    <group ref={group} position={toMetres(panel.position)}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          // A fresh material when fading: flipping `transparent` on one in use
          // doesn't reliably take.
          key={faded ? 'faded' : 'solid'}
          color={color}
          roughness={0.75}
          transparent={faded}
          opacity={faded ? 0.15 : 1}
          depthWrite={!faded}
        />
        <Edges threshold={15} color={edge} />
      </mesh>
      {label && !faded && (
        <Html position={toMetres(nearJoint.map((v, k) => v + tag[k]) as Vec3)} center zIndexRange={[60, 50]}>
          <span
            className="text-micro pointer-events-none rounded px-1.5 py-0.5 font-medium whitespace-nowrap text-white shadow"
            style={{ background: color }}
          >
            {panel.name}
          </span>
        </Html>
      )}
    </group>
  )
}

/** The middle of a piece's drawn wood (mm from its centre), where its label
 *  hangs from. */
function jointSide(solid: Bounds[]): Vec3 {
  let volume = 0
  const sum = [0, 0, 0]
  for (const b of solid) {
    const v = (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2])
    volume += v
    for (const k of [0, 1, 2]) sum[k] += ((b.min[k] + b.max[k]) / 2) * v
  }
  return (volume > 0 ? sum.map((s) => s / volume) : [0, 0, 0]) as Vec3
}

/** The outline of where the parts overlap, left in place as they're pulled
 *  apart, so it's clear where each piece came from. */
function JointOutline({ joint, color }: { joint: Bounds; color: string }) {
  const key = [0, 1, 2].map((k) => joint.max[k] - joint.min[k]).join(',')
  const geometry = useMemo(() => new BoxGeometry(...toMetres(key.split(',').map(Number) as Vec3)), [key])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={toMetres(joint.min.map((v, k) => (v + joint.max[k]) / 2) as Vec3)}>
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <Edges color={color} />
    </mesh>
  )
}
