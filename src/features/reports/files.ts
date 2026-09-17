// File handling for report uploads: validation (pure) and preparation (browser only).
import type { AIAttachment } from '../../ai'
import { downscaleImage } from '../../native/camera'

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
/** Originals at or above this size are not kept in the local database; only the extracted data is. */
export const MAX_STORED_BYTES = 4 * 1024 * 1024
export const REPORT_IMAGE_MAX_EDGE = 1600
export const REPORT_ACCEPT = 'application/pdf,image/*'

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|bmp|tiff?)$/i

/** 'pdf' | 'image' from the MIME type, falling back to the extension (iOS sometimes reports an empty type). Null when unsupported. */
export function uploadKind(f: { type: string; name: string }): 'pdf' | 'image' | null {
  const type = (f.type || '').toLowerCase()
  if (type === 'application/pdf' || (!type && /\.pdf$/i.test(f.name))) return 'pdf'
  if (type.startsWith('image/') || (!type && IMAGE_EXT.test(f.name))) return 'image'
  return null
}

/** A plain sentence when the file cannot be used, otherwise null. */
export function validateUpload(f: { type: string; name: string; size: number }): string | null {
  if (!uploadKind(f)) return 'Choose a PDF or a photo of the report.'
  if (f.size <= 0) return 'That file is empty.'
  if (f.size > MAX_UPLOAD_BYTES) return 'That file is over 15 MB. Try a smaller PDF or a photo of the page.'
  return null
}

export function base64Bytes(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - pad)
}

export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

/** "blood-panel_2026.pdf" -> "blood panel 2026" */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return base.slice(0, 80) || 'Report'
}

/** Splits a data URL into the attachment shape the AI gateway takes. Null when it is not a base64 data URL. */
export function dataUrlToAttachment(dataUrl: string, name?: string): AIAttachment | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl)
  if (!m) return null
  return { mediaType: m[1], base64: m[2], name }
}

export interface PreparedFile {
  name: string
  mediaType: string
  base64: string
  /** Decoded size of what would be sent / stored (after image downscaling). */
  bytes: number
  /** The data URL to keep locally, or null when the file is 4 MB or larger. */
  storedDataUrl: string | null
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the file.')))
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

/** Images are downscaled to ≤ 1600 px JPEG (EXIF stripped); PDFs are read as base64. Throws a plain sentence on failure. */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const problem = validateUpload(file)
  if (problem) throw new Error(problem)
  if (uploadKind(file) === 'image') {
    const img = await downscaleImage(file, REPORT_IMAGE_MAX_EDGE)
    return { name: file.name || 'photo.jpg', mediaType: img.mediaType, base64: img.base64, bytes: img.bytes, storedDataUrl: img.bytes < MAX_STORED_BYTES ? img.dataUrl : null }
  }
  const dataUrl = await readAsDataUrl(file)
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  if (!base64) throw new Error('Could not read the file.')
  const bytes = base64Bytes(base64)
  return { name: file.name || 'report.pdf', mediaType: 'application/pdf', base64, bytes, storedDataUrl: bytes < MAX_STORED_BYTES ? `data:application/pdf;base64,${base64}` : null }
}
