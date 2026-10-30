// Records the README demo GIF by driving the real app through a small build:
// a nightstand, put together through the UI, ending on its cutlist.
//
//   npm run dev                       # in another terminal
//   npm run record:demo               # writes public/demo.gif
//   npm run record:demo -- --out somewhere.gif --url http://localhost:5173/Panelizer/
//
// It drives the Microsoft Edge (or Chrome, with --browser chrome) already
// installed on the machine, headless and in a fresh profile — your own saved
// projects are never touched. Frames come from the browser's screencast, and
// the GIF is encoded here: a palette shared by every frame, pixels that didn't
// change left transparent, at most ~12 fps — which keeps the file small.

import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { PNG } from 'pngjs'
import gifenc from 'gifenc' // CommonJS: no named exports

const { GIFEncoder, applyPalette, quantize } = gifenc

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const URL = arg('url', 'http://localhost:5173/Panelizer/')
const OUT = arg('out', 'public/demo.gif')
const CHANNEL = arg('browser', 'msedge') === 'chrome' ? 'chrome' : 'msedge'
/** Optional folder to also save a still about every 2 s into, for reviewing a take. */
const STILLS = arg('stills', null)
const WIDTH = 960
const HEIGHT = 600
/** Frames closer together than this (ms) are merged, capping the frame rate. */
const MIN_FRAME_MS = 80

// ---- A visible cursor ------------------------------------------------------
// Headless screenshots don't include the mouse, so draw one that follows the
// pointer, with a ripple on each click.
const CURSOR_SCRIPT = `
  window.addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div')
    c.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-2px 0 0 -2px;z-index:2147483647;pointer-events:none;transition:transform 60ms'
    c.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 1 L2 15 L6 11.5 L8.5 17 L11 16 L8.5 10.5 L14 10.5 Z" fill="#fff" stroke="#111" stroke-width="1.2" stroke-linejoin="round"/></svg>'
    document.body.appendChild(c)
    addEventListener('pointermove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' }, true)
    addEventListener('pointerdown', (e) => {
      const r = document.createElement('div')
      r.style.cssText = 'position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2px solid #6b9dff;z-index:2147483646;pointer-events:none;transition:all 350ms ease-out;opacity:1'
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'
      document.body.appendChild(r)
      requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0' })
      setTimeout(() => r.remove(), 400)
    }, true)
  })
`

// ---- Driving the app -------------------------------------------------------

const browser = await chromium.launch({
  channel: CHANNEL,
  headless: true,
  // Headless has no GPU; let WebGL fall back to software rendering.
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
})
// A failed step shouldn't leave a headless browser running.
process.on('uncaughtException', async (e) => {
  console.error(e)
  await browser.close()
  process.exit(1)
})
process.on('unhandledRejection', async (e) => {
  console.error(e)
  await browser.close()
  process.exit(1)
})

const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 })
await page.addInitScript(CURSOR_SCRIPT)
await page.goto(URL)
await page.waitForSelector('canvas')
await page.mouse.move(WIDTH / 2, HEIGHT / 2)

const wait = (ms) => page.waitForTimeout(ms)

/** Glide the cursor to an element's centre, then click it. */
async function click(locator) {
  const box = await locator.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 })
  await wait(120)
  // Clicks the same spot, but waits for the element to be stable and on top.
  await locator.click({ timeout: 5000 })
}

/** A measurement field in the panel editor, by its label ("Length", "X"…). */
const field = (label) =>
  page.locator('main label').filter({ has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) }).locator('input')

/** Click a field, replace its value, and commit with Enter. */
async function type(locator, value) {
  await click(locator)
  await page.keyboard.press('Control+A')
  await page.keyboard.type(String(value), { delay: 45 })
  await page.keyboard.press('Enter')
  await wait(150)
}

/** Add a panel from the "+ Add" menu. */
async function add(preset) {
  await click(page.getByRole('banner').getByRole('button', { name: '+ Add' }))
  await wait(200)
  await click(page.getByRole('button', { name: preset, exact: true }))
  await wait(300)
}

/** Fill the editor for the selected panel. */
async function shape(values) {
  for (const [label, value] of Object.entries(values)) await type(field(label), value)
}

// ---- Recording -------------------------------------------------------------

const cdp = await page.context().newCDPSession(page)
const frames = []
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  frames.push({ png: Buffer.from(data, 'base64'), t: metadata.timestamp * 1000 })
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await cdp.send('Page.startScreencast', { format: 'png', maxWidth: WIDTH, maxHeight: HEIGHT })
await wait(600)

// The nightstand (mm): 450 wide, 400 deep, 550 tall carcass, 18 mm ply,
// a top overhanging 20 mm with rounded front corners, a shelf, a 6 mm back.
await type(page.getByLabel('Project name'), 'Nightstand')

await add('Side')
await shape({ Length: 400, Width: 550, X: -216, Y: 275, Z: 0 })
await page.keyboard.press('Control+D')
await wait(250)
await shape({ Name: 'Side', X: 216 })

await add('Top / Bottom / Shelf')
await shape({ Name: 'Bottom', Length: 414, Width: 400, X: 0, Y: 9, Z: 0 })
await page.keyboard.press('Control+D')
await wait(250)
await shape({ Name: 'Shelf', Width: 380, X: 0, Y: 290, Z: -10 })

await add('Top / Bottom / Shelf')
await shape({ Length: 490, Width: 420, X: 0, Y: 559, Z: 10 })
// Round the two front corners of the top; the viewport lights each one up.
await type(page.getByLabel('Front left corner'), 40)
await type(page.getByLabel('Front right corner'), 40)

await add('Back')
await shape({ Length: 414, Width: 550, X: 0, Y: 275, Z: -197 })

// Step back and take a look around.
await page.keyboard.press('Escape')
await page.mouse.move(WIDTH * 0.35, HEIGHT * 0.6, { steps: 10 })
await page.keyboard.press('f')
await wait(700)
await page.mouse.down()
await page.mouse.move(WIDTH * 0.47, HEIGHT * 0.58, { steps: 40 })
await page.mouse.up()
await wait(600)

// The cutlist: add the sheets it asks for (18 mm and 6 mm ply), and see the
// saw-friendly layout.
await click(page.getByRole('button', { name: 'Cutlist' }))
await page.getByText('Missing stock').waitFor()
await wait(1200)
const addSheet = page.getByRole('button', { name: '+ Add sheet' })
while ((await addSheet.count()) > 0) {
  await click(addSheet.first())
  await wait(900)
}
await wait(3000)

await cdp.send('Page.stopScreencast')
await browser.close()

// ---- Encoding --------------------------------------------------------------

// Merge frames that arrived too close together, and give each its duration.
const kept = []
for (const f of frames) {
  const last = kept[kept.length - 1]
  if (last && f.t - last.t < MIN_FRAME_MS) last.png = f.png
  else kept.push({ ...f })
}
kept.forEach((f, i) => (f.delay = Math.round((kept[i + 1]?.t ?? f.t + 2000) - f.t)))

if (STILLS) {
  mkdirSync(STILLS, { recursive: true })
  let next = 0
  for (const [i, f] of kept.entries()) {
    if (f.t - kept[0].t < next && i < kept.length - 1) continue
    writeFileSync(`${STILLS}/still-${((f.t - kept[0].t) / 1000).toFixed(1).padStart(4, '0')}s.png`, f.png)
    next += 2000
  }
}

const decode = (png) => {
  const { width, height, data } = PNG.sync.read(png)
  return { width, height, rgba: new Uint8Array(data.buffer, data.byteOffset, data.length) }
}

// One palette for every frame (from a sample of them): no colour flicker, and
// unchanged pixels stay byte-identical so they can be skipped.
const { width, height } = decode(kept[0].png)
const sample = kept.filter((_, i) => i % Math.ceil(kept.length / 12) === 0).map((f) => decode(f.png).rgba)
const merged = new Uint8Array(sample.reduce((n, s) => n + s.length, 0))
sample.reduce((offset, s) => (merged.set(s, offset), offset + s.length), 0)
const palette = quantize(merged, 255)
const TRANSPARENT = palette.length
palette.push([0, 0, 0])

const gif = GIFEncoder()
let previous = null
for (const f of kept) {
  const { rgba } = decode(f.png)
  const index = applyPalette(rgba, palette)
  const out = index.slice()
  if (previous) for (let i = 0; i < out.length; i++) if (out[i] === previous[i]) out[i] = TRANSPARENT
  gif.writeFrame(out, width, height, {
    palette,
    delay: f.delay,
    transparent: previous !== null,
    transparentIndex: TRANSPARENT,
    dispose: 1,
  })
  previous = index
}
gif.finish()
writeFileSync(OUT, gif.bytes())

const seconds = kept.reduce((s, f) => s + f.delay, 0) / 1000
console.log(`${OUT}: ${kept.length} frames, ${seconds.toFixed(1)} s, ${(gif.bytes().length / 1024 / 1024).toFixed(2)} MB`)
