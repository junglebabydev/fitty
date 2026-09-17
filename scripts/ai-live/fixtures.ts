// Synthetic inputs for the live smoke test, built in memory (nothing is downloaded, nothing is a real person's data):
// two tiny PNGs drawn pixel by pixel and a one-page, hand-written PDF "lab report" with printed reference ranges.
import { deflateSync } from 'node:zlib'

// --- PNG -----------------------------------------------------------------------------------------------------------

type RGB = [number, number, number]

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(width: number, height: number, pixel: (x: number, y: number) => RGB): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), row + 1 + x * 3)
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const inCircle = (x: number, y: number, cx: number, cy: number, r: number) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r

/** Not food: a grey desk, a dark laptop-like rectangle with a blue screen, a red notebook. */
export function notFoodPng(): Buffer {
  return png(320, 240, (x, y) => {
    if (x > 60 && x < 220 && y > 40 && y < 140) return x > 70 && x < 210 && y > 50 && y < 130 ? [40, 90, 200] : [30, 30, 34]
    if (x > 50 && x < 230 && y >= 140 && y < 170) return [60, 60, 66]
    if (x > 245 && x < 300 && y > 90 && y < 190) return [190, 40, 40]
    return [150 + ((x + y) % 7), 150 + ((x + y) % 7), 155]
  })
}

/** A crude drawing of a plate with a fried egg: a drawing, not a photo, so any item should come back with low confidence. */
export function drawnEggPng(): Buffer {
  return png(320, 240, (x, y) => {
    if (inCircle(x, y, 150, 125, 22)) return [245, 190, 40]
    if (inCircle(x, y, 160, 120, 58) || inCircle(x, y, 130, 140, 40)) return [250, 248, 240]
    if (inCircle(x, y, 160, 120, 100)) return inCircle(x, y, 160, 120, 92) ? [225, 228, 232] : [200, 204, 210]
    return [120 + ((x * 3 + y) % 9), 84, 52]
  })
}

// --- PDF -----------------------------------------------------------------------------------------------------------

/** What the report prints, so the smoke test can check the transcription field by field. `null` = nothing printed. */
export const LAB_EXPECTED = [
  { name: 'Total Cholesterol', value: 5.8, unit: 'mmol/L', ref_low: null, ref_high: 5.2 },
  { name: 'HDL Cholesterol', value: 1.3, unit: 'mmol/L', ref_low: 1.0, ref_high: null },
  { name: 'Triglycerides', value: 1.1, unit: 'mmol/L', ref_low: null, ref_high: 1.7 },
  { name: 'Fasting Glucose', value: 5.1, unit: 'mmol/L', ref_low: 3.9, ref_high: 6.0 },
  { name: 'Haemoglobin', value: 14.2, unit: 'g/dL', ref_low: 13.0, ref_high: 17.0 },
  { name: 'Ferritin', value: 88, unit: 'ug/L', ref_low: null, ref_high: null },
] as const

export const LAB_DATE = '2026-08-14'

const LAB_LINES: [number, string][] = [
  [12, 'NORTHBRIDGE MEDICAL LABORATORY (SAMPLE - NOT A REAL REPORT)'],
  [10, 'Patient: TEST PATIENT        Collected: 14 Aug 2026        Report: Blood test'],
  [10, ''],
  [10, 'Test                  Result   Flag   Unit      Reference range'],
  [11, 'LIPIDS'],
  [10, 'Total Cholesterol     5.8      H      mmol/L    < 5.2'],
  [10, 'HDL Cholesterol       1.3             mmol/L    > 1.0'],
  [10, 'Triglycerides         1.1             mmol/L    < 1.7'],
  [11, 'GLUCOSE'],
  [10, 'Fasting Glucose       5.1             mmol/L    3.9 - 6.0'],
  [11, 'FULL BLOOD COUNT'],
  [10, 'Haemoglobin           14.2            g/dL      13.0 - 17.0'],
  [11, 'IRON STUDIES'],
  [10, 'Ferritin              88              ug/L'],
]

/** One A5-ish page of Courier text. Offsets in the xref table are computed, so any PDF reader opens it. */
export function labReportPdf(): Buffer {
  let y = 380
  const text = LAB_LINES.map(([size, line]) => {
    y -= size + 8
    return `BT /F1 ${size} Tf 36 ${y} Td (${line.replace(/([\\()])/g, '\\$1')}) Tj ET`
  }).join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 520 400] /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ]
  let out = '%PDF-1.4\n'
  const offsets = objects.map((body, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
