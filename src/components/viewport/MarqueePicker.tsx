import { useEffect } from 'react'
import { Vector3 } from 'three'
import { useThree } from '@react-three/fiber'
import { MM_TO_M } from '../../lib/geometry'
import { panelCorners } from '../../lib/corners'
import { useDesignStore } from '../../store/designStore'

/**
 * Consumes a marquee rectangle produced by the DOM overlay and turns it into a
 * selection. It lives inside the Canvas because it needs the live camera to
 * project each panel's corners to screen space; a panel is selected when its
 * projected bounding box overlaps the marquee. Renders nothing.
 */
export function MarqueePicker() {
  const box = useDesignStore((s) => s.marqueeBox)
  const setMarqueeBox = useDesignStore((s) => s.setMarqueeBox)
  const selectInBox = useDesignStore((s) => s.selectInBox)
  const panels = useDesignStore((s) => s.panels)
  const { camera, size } = useThree()

  useEffect(() => {
    if (!box) return
    const v = new Vector3()
    const ids: string[] = []

    for (const panel of panels) {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      let anyInFront = false

      for (const [cx, cy, cz] of panelCorners(panel)) {
        v.set(cx * MM_TO_M, cy * MM_TO_M, cz * MM_TO_M).project(camera)
        if (v.z < 1) anyInFront = true // z >= 1 is behind the camera
        const sx = (v.x * 0.5 + 0.5) * size.width
        const sy = (-v.y * 0.5 + 0.5) * size.height
        minX = Math.min(minX, sx)
        maxX = Math.max(maxX, sx)
        minY = Math.min(minY, sy)
        maxY = Math.max(maxY, sy)
      }

      const overlaps =
        anyInFront && minX <= box.x + box.w && maxX >= box.x && minY <= box.y + box.h && maxY >= box.y
      if (overlaps) ids.push(panel.id)
    }

    selectInBox(ids, box.additive)
    setMarqueeBox(null)
  }, [box, panels, camera, size.width, size.height, selectInBox, setMarqueeBox])

  return null
}
