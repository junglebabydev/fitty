// Builds the exercise photos from AI frames: public/moves/photo/<id>.webp is one picture of the move, 4:3 with the
// person filling it, and public/moves/thumb/<id>.webp is the same picture cropped square around the person, for list
// thumbnails. Frames are photos of one woman on white, named <id>-1.jpg and <id>-2.jpg (start and end of the
// movement; a hold has one), generated with Gemini image models (and Canva's generator for the first drafts) from
// text prompts and reference frames; see EXERCISE_PHOTOS in src/data/exerciseMedia.ts. Frame 1 is used unless the
// move is in SECOND, where the end of the movement shows it better (the squat at the bottom, the press overhead).
// A move with two frames that is not in STILL also gets public/moves/photo/<id>-b.webp, the other end of the movement,
// cropped with the same box so the app can swap the two with a hard cut (EXERCISE_PHOTO_LOOPS). Never faded: two frames
// faded into each other read as a ghost, not a movement (owner, 2026-10-14).
// One-off tool, not part of the build: needs sharp (`npm i --no-save sharp`).
// Run: node scripts/moves/build.mjs <framesDir> [id …]   (the frames are kept out of git, in .moves-src/white/f)
import sharp from 'sharp'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Moves whose second frame (the end of the movement) is the clearer picture. Picked by eye, 2026-10-14. */
const SECOND = new Set([
  'arabesque', 'band_monster_walk', 'bb_back_squat', 'bb_hang_pull', 'bb_row', 'bike_climb', 'db_overhead_triceps',
  'db_pullover_bridge', 'db_standing_press', 'double_under', 'glute_bridge', 'hip_thrust', 'kb_bottoms_up_press',
  'kb_halo', 'kb_rdl', 'kb_suitcase_squat', 'kb_swing', 'kneeling_hip_thrust', 'landmine_lunge_press', 'lateral_lunge',
  'one_arm_db_row', 'pallof_press_overhead', 'plank_shoulder_tap', 'rowing_machine', 'ski_erg', 'sl_bridge_bench',
  'step_jack', 'swiss_ball_leg_curl',
])

/**
 * Two-frame moves that stay one picture, because swapping their frames would not show the exercise. Every pair was
 * checked by eye on 2026-10-15, side by side and overlaid, against the exercise's own instructions.
 */
const STILL = new Map([
  ['db_fly', 'frame 2 is a pullover (dumbbells behind the head), not a fly; three side-on redraws came back as a pullover or a dead hang'],
])

/** Loops whose frame 2 sits lower than frame 1: lined up on the floor so the feet stay planted. */
const FLOOR = new Set(['bb_sumo_deadlift'])

const PHOTO_W = 960, THUMB = 192
/** White space around the person, as a share of their larger side. */
const MARGIN = 0.06
const QUALITY = 78
/** Wide enough that any crop around the person stays inside the padded frame. */
const PAD = 1200

/** The person's box on the white frame: [x0, y0, x1, y1], read against the corner colour. */
async function box(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  const px = (x, y) => { const i = (y * w + x) * 3; return [data[i], data[i + 1], data[i + 2]] }
  const bg = px(4, 4)
  const off = (x, y) => { const p = px(x, y); return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 40 }
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (off(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  return [x0, y0, x1, y1]
}

/** The frame cropped to `aspect` (width / height) around the box with a margin, padded with white where it runs off. */
async function crop(file, [x0, y0, x1, y1], aspect, width) {
  const bw = x1 - x0, bh = y1 - y0
  const m = MARGIN * Math.max(bw, bh)
  let w = bw + 2 * m, h = bh + 2 * m
  if (w / h < aspect) w = h * aspect; else h = w / aspect
  const left = Math.round((x0 + x1) / 2 - w / 2) + PAD, top = Math.round((y0 + y1) / 2 - h / 2) + PAD
  return sharp(await sharp(file).extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: '#fff' }).toBuffer())
    .extract({ left, top, width: Math.round(w), height: Math.round(h) })
    .resize({ width: Math.min(width, Math.round(w)) })
    .webp({ quality: QUALITY })
    .toBuffer()
}

const [dir, ...only] = process.argv.slice(2)
if (!dir) { console.error('usage: node scripts/moves/build.mjs <framesDir> [id …]'); process.exit(1) }
const root = join(import.meta.dirname, '../../public/moves')
const out = { photo: join(root, 'photo'), thumb: join(root, 'thumb') }
mkdirSync(out.photo, { recursive: true }); mkdirSync(out.thumb, { recursive: true })
const names = readdirSync(dir)
const frame = (id, n) => ['jpg', 'png'].map((x) => `${id}-${n}.${x}`).find((f) => names.includes(f))
const ids = [...new Set(names.map((f) => /^(.+)-1\.(?:jpg|png)$/.exec(f)?.[1]).filter(Boolean))].filter((id) => !only.length || only.includes(id)).sort()
let photos = 0, thumbs = 0
const loops = []
for (const id of ids) {
  const n = SECOND.has(id) && frame(id, 2) ? 2 : 1
  const file = join(dir, frame(id, n))
  const b = await box(file)
  const loop = frame(id, 2) && !STILL.has(id)
  let p, other
  if (loop) {
    // Both frames in one box, in frame 1's coordinates (the camera did not move between them), so nothing jumps.
    const f = [join(dir, frame(id, 1)), join(dir, frame(id, 2))]
    const [b1, b2] = await Promise.all(f.map(box))
    const dy = FLOOR.has(id) ? b1[3] - b2[3] : 0
    const u = [Math.min(b1[0], b2[0]), Math.min(b1[1], b2[1] + dy), Math.max(b1[2], b2[2]), Math.max(b1[3], b2[3] + dy)]
    const [c1, c2] = await Promise.all([crop(f[0], u, 4 / 3, PHOTO_W), crop(f[1], [u[0], u[1] - dy, u[2], u[3] - dy], 4 / 3, PHOTO_W)])
    ;[p, other] = n === 2 ? [c2, c1] : [c1, c2]
    writeFileSync(join(out.photo, `${id}-b.webp`), other)
    loops.push(id)
  } else {
    p = await crop(file, b, 4 / 3, PHOTO_W)
  }
  const t = await crop(file, b, 1, THUMB)
  writeFileSync(join(out.photo, `${id}.webp`), p)
  writeFileSync(join(out.thumb, `${id}.webp`), t)
  photos += p.length + (other?.length ?? 0); thumbs += t.length
  console.log(`${id.padEnd(24)} frame ${n}${loop ? ' + loop' : '       '}  ${(p.length / 1024).toFixed(0)} KB + ${(t.length / 1024).toFixed(1)} KB thumb`)
}
console.log(`${ids.length} moves, ${loops.length} loops: photos ${(photos / 1024).toFixed(0)} KB, thumbs ${(thumbs / 1024).toFixed(0)} KB`)
console.log(`EXERCISE_PHOTO_LOOPS: ${JSON.stringify(loops)}`)
