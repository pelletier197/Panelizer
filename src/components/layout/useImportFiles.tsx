import { parse, type Design } from '../../lib/persistence'
import { importProjects, parseBundle } from '../../lib/projects'
import { useDesignStore } from '../../store/designStore'
import { useConfirm } from '../ui/useConfirm'

/**
 * Import one or more files picked by the user. Each file may be a single
 * design or a backup of every project (see `bundleAllProjects`).
 *
 * - One single design opens straight away as a new project, as before.
 * - Anything more — a backup, or several files — is added to the projects list
 *   without switching away from what's open, and a summary says how many came
 *   in. Nothing is ever overwritten: re-importing a backup adds copies.
 *
 * Files that can't be read are named in the summary instead of aborting the
 * rest.
 */
export function useImportFiles() {
  const newProject = useDesignStore((s) => s.newProject)
  const confirm = useConfirm()

  return async (files: FileList | File[]) => {
    const designs: Design[] = []
    const fromBundles: { updatedAt: number; design: Design }[] = []
    const failed: string[] = []

    for (const file of Array.from(files)) {
      try {
        const text = await file.text()
        const bundle = parseBundle(text)
        if (bundle) fromBundles.push(...bundle)
        else designs.push(parse(text))
      } catch {
        failed.push(file.name)
      }
    }

    if (designs.length === 1 && fromBundles.length === 0 && failed.length === 0) {
      newProject(designs[0])
      return
    }

    const imported = importProjects([...fromBundles, ...designs.map((design) => ({ design }))])
    await confirm({
      title: imported > 0 ? `Imported ${imported} project${imported === 1 ? '' : 's'}` : 'Nothing imported',
      body: (
        <>
          {imported > 0 && <p className="m-0">They're in the projects menu, next to the project name.</p>}
          {failed.length > 0 && (
            <p className="m-0 mt-2">
              Couldn't read {failed.length === 1 ? 'this file' : 'these files'}: {failed.join(', ')}
            </p>
          )}
        </>
      ),
      confirmLabel: 'OK',
      dismissOnly: true,
    })
  }
}
