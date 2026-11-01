/** A count with its noun, singular or plural to match: `plural(1, 'panel')` is
 *  "1 panel", `plural(3, 'panel')` "3 panels". Pass `many` for a noun that
 *  isn't made plural with an s. */
export function plural(count: number, word: string, many = `${word}s`): string {
  return `${count} ${count === 1 ? word : many}`
}
