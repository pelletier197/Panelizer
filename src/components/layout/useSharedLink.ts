import { useEffect, useRef } from 'react'
import { clearSharedToken, linkToDesign, sharedToken } from '../../lib/share'
import { useConfirm } from '../ui/useConfirm'
import { useDesignStore } from '../../store/designStore'
import { frameView } from '../viewport/frameView'

/**
 * Opens a design that arrived in the URL, as a new project of its own — so it
 * never replaces whatever the visitor already had open.
 *
 * Still asks first, so following a link never silently adds a project. The
 * design is decoded *before* prompting so a corrupt link says so rather than
 * asking a question and then failing.
 *
 * The token is stripped from the address bar either way, so a reload doesn't
 * keep re-asking.
 */
export function useSharedLink() {
  const newProject = useDesignStore((s) => s.newProject)
  const confirm = useConfirm()

  // React 18 mounts effects twice in development; without this the prompt
  // appears two deep.
  const handled = useRef(false)

  useEffect(() => {
    const token = sharedToken()
    if (!token || handled.current) return
    handled.current = true

    void (async () => {
      try {
        const design = await linkToDesign(token)
        clearSharedToken()

        const ok = await confirm({
          title: `Open “${design.name}”?`,
          body: `This link holds a design with ${design.panels.length} panel${design.panels.length === 1 ? '' : 's'}. It opens as a new project — what you have now stays in your projects list.`,
          confirmLabel: 'Open',
        })

        if (ok) {
          newProject(design)
          // Whatever angle the last project was left at, start looking at
          // this one — once it has rendered.
          requestAnimationFrame(() => frameView(design.panels))
        }
      } catch {
        clearSharedToken()
        await confirm({
          title: 'That shared link is broken',
          body: "The design couldn't be read from it. It may have been truncated when it was copied.",
          confirmLabel: 'OK',
          dismissOnly: true,
        })
      }
    })()
  }, [confirm, newProject])
}
