import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useDesignStore } from '../../store/designStore'
import { Scene } from './Scene'
import { MarqueePicker } from './MarqueePicker'

/** The 3D workspace: lighting, a reference floor grid, orbit navigation, an
 *  orientation gizmo, and the cabinet scene. Clicking empty space deselects. */
export function Viewport() {
  const select = useDesignStore((s) => s.select)
  const orbitEnabled = useDesignStore((s) => s.orbitEnabled)
  const dragMode = useDesignStore((s) => s.dragMode)

  return (
    <Canvas
      frameloop="demand"
      camera={{ position: [1.2, 1, 1.6], fov: 45 }}
      // Click on empty space clears the selection. This is a click (not a drag),
      // so a marquee box-drag never triggers it — the two don't collide.
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={['#1a1c20']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 5, 2]} intensity={1.3} />
      <directionalLight position={[-2, 2, -3]} intensity={0.4} />

      <Grid
        args={[10, 10]}
        cellSize={0.1}
        cellColor="#3a3d44"
        sectionSize={1}
        sectionColor="#55585f"
        fadeDistance={18}
        fadeStrength={1.5}
        infiniteGrid
      />

      <Scene />
      <MarqueePicker />

      <OrbitControls makeDefault enabled={orbitEnabled && dragMode === 'orbit'} />
      <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
        <GizmoViewport labelColor="white" axisHeadScale={1} />
      </GizmoHelper>
    </Canvas>
  )
}
