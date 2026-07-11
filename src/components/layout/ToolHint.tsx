import { useDesignStore } from '../../store/designStore'

/** A small banner over the viewport telling the user the next step of the
 *  active tool. Hidden for free-drag tools (`move`) that need no guidance. */
export function ToolHint() {
  const tool = useDesignStore((s) => s.tool)
  const pick = useDesignStore((s) => s.toolPick)

  if (tool === 'move') return null

  const text = (() => {
    switch (tool) {
      case 'move-snap':
        return pick ? 'Now click the corner to move it onto' : 'Click a corner to grab'
      case 'measure':
        return pick ? 'Click the other corner to measure' : 'Click the first corner'
      case 'resize':
        return 'Drag a face to resize · Alt = both sides'
    }
  })()

  return <div className="tool-hint">{text}</div>
}
