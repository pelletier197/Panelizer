import { MOUSE } from 'three'
import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useDesignStore } from '../../store/designStore'
import { Scene } from './Scene'
import { BoxSelect } from './BoxSelect'
import { CameraFramer } from './CameraFramer'

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
      // Click on empty space clears the selection. This is a click (not a drag),
      // so a box-select drag never triggers it — the two don't collide.
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={[paint.scene]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={1.3} />
      <directionalLight position={[-2, 2, -3]} intensity={0.4} />

      <Grid
        args={[10, 10]}
        cellSize={0.1}
        cellColor={paint.grid}
        sectionSize={1}
        sectionColor={paint.gridMajor}
        fadeDistance={18}
        fadeStrength={1.5}
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
