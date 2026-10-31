import { MOUSE, NoToneMapping } from 'three'
import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useDesignStore } from '../../store/designStore'
import { Scene } from './Scene'
import { BoxSelect } from './BoxSelect'
import { CameraFramer } from './CameraFramer'
import { HeadLight } from './HeadLight'

const MOUSE_BUTTONS = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }
import { palette } from './palette'

/** The 3D workspace: lighting, a reference floor grid, orbit navigation, an
 *  orientation gizmo, and the cabinet scene. Clicking empty space deselects;
 *  Shift+drag box-selects (see BoxSelect). */
export function Viewport() {
  const select = useDesignStore((s) => s.select)
  const orbitEnabled = useDesignStore((s) => s.orbitEnabled)
  const paint = palette()

  return (
    <Canvas
      frameloop="demand"
      camera={{ position: [1.2, 1, 1.6], fov: 45 }}
      // No tone mapping: a face turned to you shows the colour as picked.
      // (The default, ACES, greys whites and shifts saturated colours; the
      // presentation view, which aims for a photo, uses a neutral one.)
      gl={{ toneMapping: NoToneMapping }}
      // Click on empty space clears the selection. This is a click (not a drag),
      // so a box-select drag never triggers it — the two don't collide.
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={[paint.scene]} />
      {/* Even light, so colours read true: a base everywhere, a lamp on the
          camera so the faces you look at are lit, and a softer one from above
          so the top and sides still tell apart. Intensities are physical: a
          face takes in 1/π of a light's intensity, so together these add up to
          about π on a face turned to you — its colour, as picked. */}
      <ambientLight intensity={1.6} />
      <HeadLight intensity={1.6} />
      <directionalLight position={[1, 5, 0.5]} intensity={1} />

      <Grid
        args={[10, 10]}
        cellSize={0.1}
        cellColor={paint.grid}
        // drei's defaults (0.5 / 1 px) draw hairlines that vanish at a glance;
        // these stay thin but readable.
        cellThickness={0.8}
        sectionSize={1}
        sectionColor={paint.gridMajor}
        sectionThickness={1.3}
        // Fade later and more gently, so the grid doesn't dissolve a few metres
        // behind the model.
        fadeDistance={25}
        fadeStrength={1}
        infiniteGrid
      />

      <Scene />
      <BoxSelect />
      <CameraFramer />

      {/* Middle-drag pans (CAD convention) rather than OrbitControls' default
          dolly — the wheel already zooms. Ctrl+drag and right-drag pan too. */}
      <OrbitControls makeDefault enabled={orbitEnabled} mouseButtons={MOUSE_BUTTONS} />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </Canvas>
  )
}
