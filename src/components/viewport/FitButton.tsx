import { useDesignStore } from '../../store/designStore'
import { useTouch } from '../../hooks/useMedia'
import { Button } from '../ui/Button'
import { frameView } from './frameView'

/**
 * The F key, for a touch screen: brings the selection (or the whole design)
 * back into view after orbiting or pinching it somewhere awkward.
 */
export function FitButton() {
  const touch = useTouch()
  const empty = useDesignStore((s) => s.panels.length === 0)
  if (!touch || empty) return null

  const fit = () => {
    const { panels, selectedIds } = useDesignStore.getState()
    const selected = panels.filter((p) => selectedIds.includes(p.id))
    frameView(selected.length > 0 ? selected : panels)
  }

  return (
    <Button className="absolute top-9 right-3 print:hidden" aria-label="Fit the view" onClick={fit}>
      ⤢ Fit
    </Button>
  )
}
