import { useEffect, useState } from 'react'
import { Button } from './Button'
import { cx } from './cx'
import { registerConfirmHost, type PendingConfirm } from './useConfirm'

/** Mount once, near the app root. Renders whichever confirmation is pending.
 *  See {@link useConfirm} for why this exists rather than `window.confirm`. */
export function ConfirmHost() {
  const [request, setRequest] = useState<PendingConfirm | null>(null)

  useEffect(() => registerConfirmHost(setRequest), [])

  const settle = (ok: boolean) => {
    request?.resolve(ok)
    setRequest(null)
  }

  useEffect(() => {
    if (!request) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false)
      if (e.key === 'Enter') settle(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!request) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onClick={() => settle(false)}
    >
      <div
        className={cx(
          'flex max-h-full w-full flex-col rounded-lg border border-edge bg-surface shadow-2xl',
          request.wide ? 'max-w-4xl' : 'max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="m-0 shrink-0 border-b border-edge px-4 py-3 text-base font-semibold">
          {request.title}
        </h2>
        {/* Scrolls rather than growing: a dialog must never outrun the window,
            whatever it is asked to show. */}
        <div className="text-small min-h-0 overflow-y-auto px-4 py-3 leading-relaxed text-ink-dim">
          {request.body}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-edge px-4 py-3">
          {!request.dismissOnly && <Button onClick={() => settle(false)}>Cancel</Button>}
          {/* An informational dialog's button only dismisses it — it isn't the
              primary action, and styling it as one competes with whatever the
              body is actually offering (the share dialog's Copy, say). */}
          <Button
            variant={request.dismissOnly ? 'default' : request.destructive ? 'danger' : 'primary'}
            autoFocus
            onClick={() => settle(true)}
          >
            {request.confirmLabel ?? 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  )
}
