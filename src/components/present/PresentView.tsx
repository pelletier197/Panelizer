import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CanvasTexture, NeutralToneMapping, PerspectiveCamera, Vector3, VSMShadowMap } from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import type { Panel } from '../../types/panel'
import { MM_TO_M, toMetres } from '../../lib/geometry'
import { frameBounds, unionBounds } from '../../lib/framing'
import { findMaterial, type Material } from '../../lib/materials'
import { downloadFile, slugify } from '../../lib/persistence'
import { useDesignStore } from '../../store/designStore'
import { panelGeometry } from '../viewport/panelGeometry'
import { lookOf } from '../viewport/finishLook'
import { usePhotos } from '../viewport/photos'
import { useEscapeToClose } from '../panels/cutlist/useCutlistModel'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'

type Vec3 = [number, number, number]

/** The camera directions offered, from the design's centre (+Z is its front). */
const ANGLES: { id: string; label: string; dir: Vec3 }[] = [
  { id: 'three-quarter-left', label: '¾ left', dir: [-1, 0.5, 1.1] },
  { id: 'front', label: 'Front', dir: [0, 0.18, 1] },
  { id: 'three-quarter-right', label: '¾ right', dir: [1, 0.5, 1.1] },
  { id: 'side', label: 'Side', dir: [1, 0.18, 0] },
  { id: 'top', label: 'Top', dir: [0.25, 1.6, 0.7] },
]
const START_ANGLE = 'three-quarter-right'

/** Studio backdrop. */
const BACKGROUND = '#ebe8e3'
/** Exported images are about this wide (px), whatever the screen. */
const EXPORT_WIDTH = 2400
const FOV = 35
const GLIDE_MS = 600

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(...v)
  return v.map((c) => c / l) as Vec3
}

/** Lets the buttons outside the canvas reach into it. */
interface Stage {
  goTo: (dir: Vec3) => void
  capture: () => Promise<Blob | null>
}

/**
 * The design shown as it would look built, to show a customer: real finishes
 * under soft studio light, with shadows that settle over a few seconds. Orbit
 * it freely (mouse or fingers), jump to a preset angle, and save the view as a
 * PNG sharper than the screen.
 */
export function PresentView() {
  const open = useDesignStore((s) => s.presentOpen)
  const setOpen = useDesignStore((s) => s.setPresentOpen)
  useEscapeToClose(open, () => setOpen(false))
  if (!open) return null
  return <Presentation onClose={() => setOpen(false)} />
}

function Presentation({ onClose }: { onClose: () => void }) {
  const name = useDesignStore((s) => s.name)
  const panels = useDesignStore(useShallow((s) => s.panels.filter((p) => !p.hidden)))
  const materials = useDesignStore((s) => s.materials)
  const stage = useRef<Stage | null>(null)
  const [angle, setAngle] = useState(START_ANGLE)
  const [saving, setSaving] = useState(false)

  const bounds = useMemo(() => unionBounds(panels), [panels])

  const choose = (id: string) => {
    setAngle(id)
    stage.current?.goTo(ANGLES.find((a) => a.id === id)!.dir)
  }

  const save = async () => {
    if (!stage.current) return
    setSaving(true)
    try {
      const blob = await stage.current.capture()
      if (blob) downloadFile(new Uint8Array(await blob.arrayBuffer()), `${slugify(name) || 'panelizer'}-${angle}.png`, 'image/png')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Presentation"
      className="fixed inset-0 z-50 flex flex-col print:hidden"
      style={{ background: BACKGROUND }}
    >
      <header className="flex h-13 shrink-0 items-center gap-3 border-b border-edge bg-surface px-3 md:px-4">
        <h2 className="m-0 min-w-0 flex-1 truncate text-base font-semibold">{name}</h2>
        <Button variant="primary" disabled={saving || !bounds} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save image'}
        </Button>
        <span className="h-6 w-px bg-edge" />
        <Button variant="ghost" icon aria-label="Close" title="Close (Esc)" onClick={onClose}>
          ✕
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
        {bounds && (
          <Canvas
            // Variance shadow maps: soft-edged, and free of the striping
            // ordinary ones leave across flat faces lit at a slant.
            shadows={{ type: VSMShadowMap }}
            dpr={[1, 2]}
            // Kept so a frame can be read back for saving.
            gl={{ preserveDrawingBuffer: true, antialias: true, toneMapping: NeutralToneMapping }}
            camera={{ fov: FOV, near: 0.01, far: 100 }}
          >
            <color attach="background" args={[BACKGROUND]} />
            <Scene panels={panels} materials={materials} bounds={bounds} stage={stage} />
          </Canvas>
        )}

        {/* Preset angles, along the bottom where a thumb reaches them. */}
        <div className="absolute inset-x-0 bottom-3 flex justify-center px-3">
          <div
            className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-edge bg-surface/90 p-1 shadow-lg shadow-black/30"
            role="group"
            aria-label="View angle"
          >
            {ANGLES.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={angle === a.id}
                className={cx(
                  'shrink-0 cursor-pointer rounded border px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                  angle === a.id
                    ? 'border-accent bg-accent text-white'
                    : 'border-transparent bg-transparent text-ink-dim hover:bg-surface-2 hover:text-ink',
                )}
                onClick={() => choose(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Scene({
  panels,
  materials,
  bounds,
  stage,
}: {
  panels: Panel[]
  materials: Material[]
  bounds: NonNullable<ReturnType<typeof unionBounds>>
  stage: React.RefObject<Stage | null>
}) {
  const { gl, scene, camera, size, invalidate } = useThree()
  const controls = useThree((s) => s.controls) as { target: Vector3; update: () => void } | null

  // Scene sizes, in metres.
  const centre = new Vector3(...toMetres(bounds.min.map((v, a) => (v + bounds.max[a]) / 2) as Vec3))
  const floor = bounds.min[1] * MM_TO_M
  const radius = (Math.hypot(...bounds.max.map((v, a) => v - bounds.min[a])) / 2) * MM_TO_M

  // The stage's actions run from buttons outside the canvas, at any time:
  // they read the latest canvas state through this ref.
  const latest = useRef({ gl, scene, camera, size, invalidate, controls, bounds })
  useEffect(() => {
    latest.current = { gl, scene, camera, size, invalidate, controls, bounds }
  })

  const glide = useRef(0)
  useEffect(() => {
    const view = (dir: Vec3) => {
      const { size, bounds } = latest.current
      const aspect = size.width / Math.max(1, size.height)
      const goal = frameBounds(bounds, normalize(dir), FOV, aspect)
      return { target: new Vector3(...toMetres(goal.target)), position: new Vector3(...toMetres(goal.position)) }
    }

    stage.current = {
      goTo: (dir) => {
        const { controls, camera, invalidate } = latest.current
        if (!controls) return
        const to = view(dir)
        const fromTarget = controls.target.clone()
        const fromPos = camera.position.clone()
        cancelAnimationFrame(glide.current)
        const start = performance.now()
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / GLIDE_MS)
          const ease = 1 - (1 - t) ** 3
          controls.target.lerpVectors(fromTarget, to.target, ease)
          camera.position.lerpVectors(fromPos, to.position, ease)
          controls.update()
          invalidate()
          if (t < 1) glide.current = requestAnimationFrame(step)
        }
        glide.current = requestAnimationFrame(step)
      },
      // Render once at a higher pixel ratio and read it back, then put the
      // screen's own resolution back.
      capture: async () => {
        const { gl, scene, camera, size } = latest.current
        const previous = gl.getPixelRatio()
        gl.setPixelRatio(Math.min(4, Math.max(previous, EXPORT_WIDTH / size.width)))
        gl.render(scene, camera)
        const blob = await new Promise<Blob | null>((resolve) => gl.domElement.toBlob(resolve, 'image/png'))
        gl.setPixelRatio(previous)
        gl.render(scene, camera)
        return blob
      },
    }

    // Start on the default angle, already in place, once the controls exist.
    const { controls, camera } = latest.current
    if (controls && camera instanceof PerspectiveCamera) {
      const first = view(ANGLES.find((a) => a.id === START_ANGLE)!.dir)
      controls.target.copy(first.target)
      camera.position.copy(first.position)
      controls.update()
    }
    return () => cancelAnimationFrame(glide.current)
  }, [controls, stage])

  return (
    <>
      {/* Soft studio light from big light panels around the model — built in
          the scene, so nothing is downloaded — plus a key light for the model's
          own shadows. */}
      {/* Bright enough that a white finish reads white (light here is in
          physical units: a surface takes in 1/π of it). */}
      <Environment resolution={256} environmentIntensity={1.2}>
        {/* A soft surround, as in a real studio: metal shows only what it
            reflects, and against black it would render black. */}
        <color attach="background" args={['#a49f97']} />
        <Lightformer form="rect" intensity={2.2} position={[0, 4, 3]} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-5, 2, -1]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[5, 2, -1]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.6} position={[0, 3, -5]} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, -2, 0]} rotation-x={-Math.PI / 2} scale={[10, 10, 1]} color="#f2ede4" />
      </Environment>
      <directionalLight
        castShadow
        // High overhead and a little in front, as in a product shot: the
        // shadow pools under and around the piece, and inside it under the top.
        // (Lights aim at the origin, which the design sits near.)
        position={[centre.x + radius * 0.8, floor + radius * 6, centre.z + radius * 2.2]}
        intensity={2}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-radius={8}
        shadow-blurSamples={16}
        shadow-camera-left={-radius * 2}
        shadow-camera-right={radius * 2}
        shadow-camera-top={radius * 2}
        shadow-camera-bottom={-radius * 2}
        shadow-camera-near={0.01}
        shadow-camera-far={radius * 12}
      />

      {panels.map((p) => (
        <PresentPanel key={p.id} panel={p} material={findMaterial(materials, p.materialId)} />
      ))}

      <GroundShadow bounds={bounds} />
      {/* The floor it stands on: invisible but for the shadow falling on it. */}
      <mesh rotation-x={-Math.PI / 2} position={[centre.x, floor, centre.z]} receiveShadow>
        {/* Only as far as the key light's shadows are worked out (±2 radii);
            beyond it they come out as stray marks on the horizon. */}
        <planeGeometry args={[radius * 4, radius * 4]} />
        <shadowMaterial transparent opacity={0.42} color="#3a332b" />
      </mesh>

      <OrbitControls
        makeDefault
        enableDamping
        // Stay above the floor the model stands on.
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={radius * 0.6}
        maxDistance={radius * 12}
      />
    </>
  )
}

/** One panel, in its finish under realistic light, casting and catching shadows. */
const PresentPanel = memo(function PresentPanel({ panel, material }: { panel: Panel; material: Material }) {
  const geometry = useMemo(() => panelGeometry(panel), [panel])
  useEffect(() => () => geometry.dispose(), [geometry])
  usePhotos() // re-render when the finish's photo arrives
  const look = lookOf(material, true)
  return (
    <mesh geometry={geometry} position={toMetres(panel.position)} castShadow receiveShadow>
      <meshStandardMaterial
        // A texture coming or going needs the shader rebuilt.
        key={`${look.map?.uuid ?? 'flat'}:${look.normalMap?.uuid ?? ''}`}
        color={look.color}
        map={look.map}
        normalMap={look.normalMap}
        normalScale={look.normalScale}
        roughness={look.roughness}
        metalness={look.metalness}
      />
    </mesh>
  )
})

/** How far (as a share of the footprint's larger side) the ground shadow
 *  fades out past the model's edges. */
const SPREAD = 0.45
const SHADOW_PX = 256

/**
 * The soft darkening of the floor around where the piece stands — what makes
 * it sit on the floor rather than float: darkest under the footprint, fading
 * smoothly to nothing a little way out. Drawn by hand, pixel by pixel, as a
 * blur filter isn't available everywhere (iOS Safari).
 */
function GroundShadow({ bounds }: { bounds: NonNullable<ReturnType<typeof unionBounds>> }) {
  const w = (bounds.max[0] - bounds.min[0]) * MM_TO_M
  const d = (bounds.max[2] - bounds.min[2]) * MM_TO_M
  const spread = Math.max(w, d) * SPREAD
  const width = w + spread * 2
  const depth = d + spread * 2

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = SHADOW_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const image = ctx.createImageData(SHADOW_PX, SHADOW_PX)
    for (let py = 0; py < SHADOW_PX; py++) {
      for (let px = 0; px < SHADOW_PX; px++) {
        // Distance (m) from this point of the floor to the footprint.
        const x = ((px + 0.5) / SHADOW_PX - 0.5) * width
        const z = ((py + 0.5) / SHADOW_PX - 0.5) * depth
        const dx = Math.max(0, Math.abs(x) - w / 2)
        const dz = Math.max(0, Math.abs(z) - d / 2)
        const t = Math.min(1, Math.hypot(dx, dz) / spread)
        const alpha = (1 - t) ** 2.2
        image.data.set([0, 0, 0, Math.round(alpha * 255)], (py * SHADOW_PX + px) * 4)
      }
    }
    ctx.putImageData(image, 0, 0)
    return new CanvasTexture(canvas)
  }, [w, d, spread, width, depth])
  useEffect(() => () => texture?.dispose(), [texture])
  if (!texture) return null

  const centre = toMetres(bounds.min.map((v, a) => (v + bounds.max[a]) / 2) as Vec3)
  return (
    <mesh rotation-x={-Math.PI / 2} position={[centre[0], bounds.min[1] * MM_TO_M + 0.0003, centre[2]]} renderOrder={-1}>
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial map={texture} transparent opacity={0.45} depthWrite={false} color="#2e2820" />
    </mesh>
  )
}
