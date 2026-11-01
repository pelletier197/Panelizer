import type { ReactNode } from 'react'

export interface ConfirmRequest {
  title: string
  body: ReactNode
  /** Label for the accept button. Defaults to "Continue". */
  confirmLabel?: string
  /** Style the accept button as destructive. */
  destructive?: boolean
  /** Just telling the user something — drops Cancel, since there is no choice
   *  to decline. Replaces the old `alert()` calls. */
  dismissOnly?: boolean
  /** A wider dialog, for reference content (tables) rather than a question. */
  wide?: boolean
  /** Label for a second way to go ahead, offered beside the main one (see
   *  {@link useChoice}). */
  alternativeLabel?: string
}

/** How a dialog was answered: the main button, the alternative, or neither. */
export type Answer = 'confirm' | 'alternative' | 'cancel'

/** Internal: the pending request, plus how to answer it. */
export interface PendingConfirm extends ConfirmRequest {
  resolve: (answer: Answer) => void
}

/** Set by the mounted <ConfirmHost />; the hook pushes requests through it. */
let open: (request: PendingConfirm) => void = () => {
  throw new Error('<ConfirmHost /> is not mounted')
}

/** Wire the host's setter in. Called by <ConfirmHost /> only. */
export function registerConfirmHost(fn: (request: PendingConfirm) => void) {
  open = fn
}

/**
 * An in-app replacement for `window.confirm`.
 *
 * The native dialog is not dependable: after a page shows a few of them the
 * browser offers "prevent this page from creating additional dialogs", and from
 * then on `confirm()` returns false without showing anything. Every guarded
 * action then silently does nothing, with no way for the user to tell why —
 * which is exactly how switching the document unit came to look broken.
 *
 * Usage mirrors the native call, so a guard stays a one-liner:
 *
 *   const confirm = useConfirm()
 *   if (!(await confirm({ title: 'Clear the design?', body: '…' }))) return
 */
export function useConfirm() {
  return (request: Omit<ConfirmRequest, 'alternativeLabel'>) =>
    new Promise<boolean>((resolve) => open({ ...request, resolve: (answer) => resolve(answer === 'confirm') }))
}

/**
 * Like {@link useConfirm}, for a question with two ways to go ahead: resolves
 * with which button was pressed, `'alternative'` being the one labelled
 * `alternativeLabel`.
 */
export function useChoice() {
  return (request: ConfirmRequest & { alternativeLabel: string }) =>
    new Promise<Answer>((resolve) => open({ ...request, resolve }))
}
