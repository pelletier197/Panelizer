import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { generateCutlist, type CutlistResult } from '../../../lib/nesting'
import type { NestRequest, NestResponse } from '../../../lib/nesting.worker'
import { buildParts, type PartRow } from '../../../lib/parts'
import { useDesignStore } from '../../../store/designStore'

/** One heading in the grain editor: grain is edited per material + thickness,
 *  since that's how stock is keyed. */
export interface GrainGroup {
  material: string
  thickness: number
  color: string
  rows: PartRow[]
}

/** Parts that couldn't be placed only because their material + thickness has no
 *  stock yet — grouped so the UI can offer a one-click "add the right sheet". */
export interface MissingStock {
  materialId: string
  materialName: string
  thickness: number
  count: number
}

const EMPTY: CutlistResult = { groups: [], unplaced: [] }

/** Start the packing worker, or null where workers aren't available (the
 *  caller then packs on the main thread). */
function startWorker(): Worker | null {
  try {
    return new Worker(new URL('../../../lib/nesting.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
}

/**
 * The nested cutlist, packed in a Web Worker so trying several layouts on a big
 * design never freezes the page. Only packs while `enabled` (the cutlist is
 * open) — there's no point re-packing on every edit, let alone every drag
 * frame, while nobody is looking. While a new layout is on its way the previous
 * one stays up, flagged `pending`.
 */
function useNesting(enabled: boolean, ...args: Parameters<typeof generateCutlist>) {
  const [state, setState] = useState<{ result: CutlistResult; pending: boolean }>({ result: EMPTY, pending: true })
  const worker = useRef<Worker | null | undefined>(undefined)
  const latest = useRef(0)

  // The worker is started on first use and stopped with the component.
  useEffect(() => () => worker.current?.terminate(), [])

  const [panels, materials, stocks, kerf, margin, options] = args
  const style = options?.style

  useEffect(() => {
    if (!enabled) return
    const request = [panels, materials, stocks, kerf, margin, { style }] as Parameters<typeof generateCutlist>
    const id = ++latest.current

    if (worker.current === undefined) {
      worker.current = startWorker()
      if (worker.current) {
        worker.current.onmessage = ({ data }: MessageEvent<NestResponse>) => {
          // Drop answers to requests that have since been replaced.
          if (data.id === latest.current) setState({ result: data.result, pending: false })
        }
      }
    }

    if (worker.current) {
      setState((s) => (s.pending ? s : { ...s, pending: true }))
      worker.current.postMessage({ id, args: request } satisfies NestRequest)
    } else {
      setState({ result: generateCutlist(...request), pending: false })
    }
  }, [enabled, panels, materials, stocks, kerf, margin, style])

  return state
}

/**
 * Everything the cutlist view derives from the design: the nested result, the
 * parts roll-up, the grain groupings, and the flavours of unplaced part.
 * Pure projection of the store — no UI state lives here. `open` gates the
 * (expensive) packing.
 */
export function useCutlistModel(open: boolean) {
  const panels = useDesignStore((s) => s.panels)
  const materials = useDesignStore((s) => s.materials)
  const stocks = useDesignStore((s) => s.stocks)
  const unit = useDesignStore((s) => s.unit)
  const precision = useDesignStore((s) => s.precision)
  const kerf = useDesignStore((s) => s.kerf)
  const margin = useDesignStore((s) => s.margin)
  const cutStyle = useDesignStore((s) => s.cutStyle)

  // Parts flagged "already cut" are dropped before nesting, but still listed in
  // the grain editor (dimmed) so they can be re-enabled.
  const toCut = useMemo(() => panels.filter((p) => !p.excludeFromCutlist), [panels])
  const { result, pending } = useNesting(open, toCut, materials, stocks, kerf, margin, { style: cutStyle })

  const parts = useMemo(
    () => buildParts(panels, materials, unit, precision),
    [panels, materials, unit, precision],
  )

  const grainGroups = useMemo(() => {
    const byKey = new Map<string, GrainGroup>()
    for (const row of parts) {
      const key = `${row.material}@${row.thickness}`
      const group = byKey.get(key)
      if (group) group.rows.push(row)
      else byKey.set(key, { material: row.material, thickness: row.thickness, color: row.color, rows: [row] })
    }
    return [...byKey.values()]
  }, [parts])

  const missing = useMemo(() => {
    const byKey = new Map<string, MissingStock>()
    for (const u of result.unplaced) {
      if (u.reason !== 'no-stock') continue
      const key = `${u.materialId}@${u.thickness}`
      const entry = byKey.get(key)
      if (entry) entry.count += 1
      else
        byKey.set(key, {
          materialId: u.materialId,
          materialName: u.materialName,
          thickness: u.thickness,
          count: 1,
        })
    }
    return [...byKey.values()]
  }, [result])

  // Why a given panel didn't make it onto a sheet — surfaced as a cue in the
  // grain list so a part with no stock / too big is easy to spot.
  const reasonById = useMemo(
    () => new Map(result.unplaced.map((u) => [u.panelId, u.reason])),
    [result],
  )

  const unplacedNote = (ids: string[]): string | null => {
    const id = ids.find((x) => reasonById.has(x))
    if (!id) return null
    const reason = reasonById.get(id)
    if (reason === 'too-big') return 'Too big for the sheet'
    if (reason === 'grain-locked') return 'Only fits turned — its grain forbids it'
    if (reason === 'no-space') return 'Not enough stock to fit it'
    return 'No matching stock'
  }

  // The printed parts list counts only what's still to cut. Built from the
  // included panels rather than filtering `parts`, whose rows mix cut and
  // uncut copies of the same part.
  const cutParts = useMemo(
    () => buildParts(toCut, materials, unit, precision),
    [toCut, materials, unit, precision],
  )

  return {
    result,
    pending,
    parts,
    cutParts,
    grainGroups,
    missing,
    unplacedNote,
  }
}

/**
 * True while the browser is producing a printout, so the diagrams can render
 * every label and size, bigger and monochrome.
 *
 * `flushSync` matters: the print-mode DOM has to be in place *before* the
 * browser snapshots the page, and a normal state update would land too late.
 */
export function usePrintMode(): boolean {
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])

  return printing
}

/** Close on Escape while `open`. */
export function useEscapeToClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])
}
