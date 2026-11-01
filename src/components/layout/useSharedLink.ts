import { useEffect, useRef } from 'react'
import { clearSharedToken, linkToDesign, sharedToken } from '../../lib/share'
import { findProjectByName } from '../../lib/projects'
import type { Design } from '../../lib/persistence'
import { useChoice, useConfirm } from '../ui/useConfirm'
import { useDesignStore } from '../../store/designStore'
import { frameView } from '../viewport/frameView'

/**
 * Opens a design that arrived in the URL.
 *
 * If a project of the same name is already saved, the link is most likely a
 * newer copy of it (the same link opened again, or an update from whoever
 * shares it), so the default is to replace that project; opening it as a new
 * one stays on offer. Otherwise it opens as a new project of its own, so it
 * never replaces whatever the visitor already had open.
 *
 * Still asks first, so following a link never silently adds or overwrites a
 * project. The design is decoded *before* prompting so a corrupt link says so
 * rather than asking a question and then failing.
 *
 * The token is stripped from the address bar either way, so a reload doesn't
 * keep re-asking.
 */
export function useSharedLink() {
  const newProject = useDesignStore((s) => s.newProject)
  const replaceProject = useDesignStore((s) => s.replaceProject)
  const confirm = useConfirm()
  const choose = useChoice()

  // React 18 mounts effects twice in development; without this the prompt
  // appears two deep.
  const handled = useRef(false)

  useEffect(() => {
    const token = sharedToken()
    if (!token || handled.current) return
    handled.current = true

    // Whatever angle the last project was left at, start looking at this one
    // — once it has rendered.
    const show = (design: Design) => requestAnimationFrame(() => frameView(design.panels))

    void (async () => {
      try {
        const design = await linkToDesign(token)
        clearSharedToken()

        const panels = `${design.panels.length} panel${design.panels.length === 1 ? '' : 's'}`
        const existing = findProjectByName(design.name)

        if (existing) {
          const answer = await choose({
            title: `Replace “${existing.name}”?`,
            body: `This link holds a design with ${panels}. You already have a project called “${existing.name}”: replacing it swaps its contents for the link's. Open as new keeps both.`,
            confirmLabel: 'Replace',
            alternativeLabel: 'Open as new',
          })
          if (answer === 'confirm') replaceProject(existing.id, design)
          if (answer === 'alternative') newProject(design)
          if (answer !== 'cancel') show(design)
          return
        }

        const ok = await confirm({
          title: `Open “${design.name}”?`,
          body: `This link holds a design with ${panels}. It opens as a new project — what you have now stays in your projects list.`,
          confirmLabel: 'Open',
        })

        if (ok) {
          newProject(design)
          show(design)
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
  }, [choose, confirm, newProject, replaceProject])
}
