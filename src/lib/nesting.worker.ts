import { generateCutlist } from './nesting'

/** A packing request: the arguments to `generateCutlist`, tagged with an id so
 *  the page can drop answers to requests it has since replaced. */
export interface NestRequest {
  id: number
  args: Parameters<typeof generateCutlist>
}

export interface NestResponse {
  id: number
  result: ReturnType<typeof generateCutlist>
}

// Typed locally rather than pulling in the WebWorker lib, which would clash
// with the DOM lib the rest of the app compiles against.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<NestRequest>) => void) | null
  postMessage: (message: NestResponse) => void
}

/** Runs the cutlist packer off the main thread, so trying several layouts on a
 *  big design never freezes the page. */
scope.onmessage = ({ data }) => {
  scope.postMessage({ id: data.id, result: generateCutlist(...data.args) })
}
