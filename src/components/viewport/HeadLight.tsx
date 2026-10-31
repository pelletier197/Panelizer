import { useRef } from 'react'
import type { DirectionalLight } from 'three'
import { useFrame } from '@react-three/fiber'

/**
 * A light that sits on the camera, as on a miner's helmet: whatever side of
 * the model you turn to is lit, so a colour reads as itself from any angle
 * rather than going dark on the faces away from a fixed lamp. Its target sits
 * at the origin, so it shines along the view.
 */
export function HeadLight({ intensity }: { intensity: number }) {
  const light = useRef<DirectionalLight>(null!)
  useFrame(({ camera }) => light.current.position.copy(camera.position))
  return <directionalLight ref={light} intensity={intensity} />
}
