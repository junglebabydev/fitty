// Builds the exercise photo loops from AI frames: public/moves/loop/<set>/<id>.svg loops the frames, and
// public/moves/still/<set>/<id>.svg is frame 1 at lower resolution (thumbnails and reduced motion). <set> is f or m.
// Frames are photos of one subject on white, named <id>-1.jpg, <id>-2.jpg … (or .png), generated with Gemini image
// models (and Canva's generator for the first drafts) from text prompts and reference frames; see
// EXERCISE_PHOTO_LOOPS in src/data/exerciseMedia.ts. Each frame is embedded as WebP, so an SVG plays offline as a
// plain <img>. Frames are lined up on the feet (the lowest row of the subject), so the person does not jump between
// frames, then scaled to fill the tile with a margin. A one-frame move gets the same picture in both files.
// One-off tool, not part of the build: needs sharp (`npm i --no-save sharp`).
// Run: node scripts/moves/build.mjs <framesDir> <f|m> [id …]   (the frames are kept out of git, in .moves-src/hi)
import sharp from 'sharp'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const W = 900, H = 675
const HOLD = 0.9, FADE = 0.3
const MARGIN = 0.04
const QUALITY = 80
/** Stills are drawn small (thumbnails), so their bitmap is this fraction of the loop's. */
const STILL_SCALE = 0.55

/** Size, the subject's box and the centre of its lowest 12 rows, read against the corner colour. */
async function measure(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const px = (x, y) => { const i = (y * w + x) * 3; return [data[i], data[i + 1], data[i + 2]] }
  const bg = px(4, 4)
  const off = (x, y) => { const p = px(x, y); return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 40 }
  let bottom = 0
  for (let y = h - 1; y >= 0 && !bottom; y--) for (let x = 0; x < w; x += 2) if (off(x, y)) { bottom = y; break }
  let fx0 = w, fx1 = 0
  for (let y = bottom - 12; y <= bottom; y++) for (let x = 0; x < w; x++) if (off(x, y)) { fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x) }
  let x0 = w, y0 = h, x1 = 0
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (off(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y) }
  return { w, h, mid: (fx0 + fx1) / 2, bottom, box: [x0, y0, x1, bottom] }
}

/** Opacity over the loop for frame `i`: on during its slots, cross-fading at the edges. */
function opacity(order, i, dur) {
  const keys = [], vals = []
  order.forEach((f, slot) => {
    const t0 = slot * (HOLD + FADE)
    keys.push(t0 / dur, (t0 + HOLD) / dur)
    vals.push(f === i ? 1 : 0, f === i ? 1 : 0)
  })
  keys.push(1); vals.push(order[0] === i ? 1 : 0)
  return `<animate attributeName="opacity" dur="${dur.toFixed(2)}s" repeatCount="indefinite" keyTimes="${keys.map((k) => k.toFixed(4)).join(';')}" values="${vals.join(';')}"/>`
}

async function build(id, files, out) {
  // Every frame of a move is read at frame 1's size, so shifts and the fit are in one unit.
  const first = await sharp(files[0]).metadata()
  const bufs = await Promise.all(files.map((f) => sharp(f).resize(first.width, first.height, { fit: 'fill' }).png().toBuffer()))
  const ms = await Promise.all(bufs.map(measure))
  const { w, h } = ms[0]
  // Line up on the frame whose feet sit lowest, so the others only move down and nothing overhead is cut off.
  const ref = ms.reduce((a, b) => (b.bottom > a.bottom ? b : a))
  const shift = ms.map((m) => [ref.mid - m.mid, ref.bottom - m.bottom])
  const u = ms.reduce((a, m, i) => [
    Math.min(a[0], m.box[0] + shift[i][0]), Math.min(a[1], m.box[1] + shift[i][1]),
    Math.max(a[2], m.box[2] + shift[i][0]), Math.max(a[3], m.box[3] + shift[i][1]),
  ], [Infinity, Infinity, -Infinity, -Infinity])
  // Fill the tile, but never draw a source pixel larger than one tile pixel.
  const fit = Math.min(1, (W * (1 - 2 * MARGIN)) / (u[2] - u[0]), (H * (1 - 2 * MARGIN)) / (u[3] - u[1]))
  const fx = W / 2 - (fit * (u[0] + u[2])) / 2, fy = H * (1 - MARGIN) - fit * u[3]
  const webp = (buf, scale) => sharp(buf).resize(Math.round(w * scale), Math.round(h * scale)).webp({ quality: QUALITY }).toBuffer().then((b) => b.toString('base64'))
  // xlink:href, not href: older WebKit (iOS Safari) ignores a plain href on <image> and draws an empty tile.
  const img = (data, i) => `<image xlink:href="data:image/webp;base64,${data}" width="${w}" height="${h}" transform="translate(${shift[i][0].toFixed(1)} ${shift[i][1].toFixed(1)})"/>`
  const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fff"/><g transform="translate(${fx.toFixed(1)} ${fy.toFixed(1)}) scale(${fit.toFixed(4)})">${body}</g></svg>\n`
  const loopData = await Promise.all(bufs.map((b) => webp(b, fit)))
  // Three frames play 1 → 2 → 3 → 2; each later frame fades in over a white backing that hides the frames below.
  const order = files.length === 3 ? [0, 1, 2, 1] : files.map((_, i) => i)
  const dur = order.length * (HOLD + FADE)
  const backing = `<rect x="${-w}" y="${-h}" width="${3 * w}" height="${3 * h}" fill="#fff"/>`
  const layers = loopData.map((d, i) => (i === 0 ? img(d, 0) : `<g opacity="0">${opacity(order, i, dur)}${backing}${img(d, i)}</g>`))
  const still = svg(img(await webp(bufs[0], fit * STILL_SCALE), 0))
  const loop = files.length > 1 ? svg(layers.join('')) : svg(layers[0])
  writeFileSync(join(out.loop, `${id}.svg`), loop)
  writeFileSync(join(out.still, `${id}.svg`), still)
  return [loop.length, still.length]
}

const [dir, set, ...only] = process.argv.slice(2)
if (!dir || !['f', 'm'].includes(set)) { console.error('usage: node scripts/moves/build.mjs <framesDir> <f|m> [id …]'); process.exit(1) }
const root = join(import.meta.dirname, '../../public/moves')
const out = { loop: join(root, 'loop', set), still: join(root, 'still', set) }
mkdirSync(out.loop, { recursive: true }); mkdirSync(out.still, { recursive: true })
const names = readdirSync(dir)
const frame = (id, n) => ['jpg', 'png'].map((x) => `${id}-${n}.${x}`).find((f) => names.includes(f))
const ids = [...new Set(names.map((f) => /^(.+)-1\.(?:jpg|png)$/.exec(f)?.[1]).filter(Boolean))].filter((id) => !only.length || only.includes(id)).sort()
let loops = 0, stills = 0
for (const id of ids) {
  const files = [1, 2, 3].map((n) => frame(id, n)).filter(Boolean).map((f) => join(dir, f))
  const [l, s] = await build(id, files, out)
  loops += l; stills += s
  console.log(`${id.padEnd(24)} ${files.length} frame${files.length > 1 ? 's' : ' '}  ${(l / 1024).toFixed(0)} KB + ${(s / 1024).toFixed(0)} KB still`)
}
console.log(`${ids.length} moves (${set}): loops ${(loops / 1024).toFixed(0)} KB, stills ${(stills / 1024).toFixed(0)} KB`)
if (existsSync(join(root, 'thruster.svg'))) console.log('Note: old flat files remain in public/moves; remove them once nothing points at them.')
