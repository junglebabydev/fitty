// Photo capture via a real, persistent, visually hidden <input type=file>. On iOS
// Safari/PWA the `capture="environment"` attribute opens the rear camera directly;
// without it the photo library sheet appears. Works over plain http (no getUserMedia).
// React screens should prefer `usePhotoPicker` / `<PhotoInput>` from './PhotoInput'. The image is downscaled to ≤ MAX_EDGE px
// JPEG on a canvas before anything else touches it, which keeps AI uploads and
// local storage small and strips EXIF (including GPS).
//
// Capacitor swap: replace `pickImageFile` with @capacitor/camera's
// Camera.getPhoto({ source: CameraSource.Camera | Photos, resultType: DataUrl })
// and pass the data URL through `downscaleImage`.

export interface PickedImage {
  dataUrl: string
  base64: string
  mediaType: string
  /** Decoded byte size of the downscaled JPEG. */
  bytes: number
  width: number
  height: number
}

export const MAX_EDGE = 1280
export const JPEG_QUALITY = 0.85

function decodedBytes(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - pad
}

export type PhotoSource = 'camera' | 'library'

/**
 * Visually hidden but still rendered (the sr-only technique). NOT display:none and NOT
 * visibility:hidden — iOS Safari ignores taps and programmatic clicks on inputs hidden that way.
 */
export const PHOTO_INPUT_STYLE = {
  position: 'fixed',
  left: 0,
  bottom: 0,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
  opacity: 0,
} as const

const PHOTO_INPUT_CSS =
  'position:fixed;left:0;bottom:0;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;' +
  'clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;border:0;opacity:0;'

const SHARED_INPUT_ID: Record<PhotoSource, string> = { camera: 'photo-input-camera', library: 'photo-input-library' }

/**
 * One persistent <input type=file> per source, kept in <body> for the life of the page.
 * (The v2 picker created a throw-away input per tap and removed it 1.2 s after the window
 * regained focus — on an iPhone that was usually before Safari delivered the photo, so the
 * 'change' event landed on a detached input and the capture silently did nothing.)
 */
function sharedInput(source: PhotoSource): HTMLInputElement {
  const id = SHARED_INPUT_ID[source]
  const found = document.getElementById(id)
  if (found instanceof HTMLInputElement) return found
  const input = document.createElement('input')
  input.id = id
  input.type = 'file'
  input.accept = 'image/*'
  if (source === 'camera') input.setAttribute('capture', 'environment')
  input.tabIndex = -1
  input.setAttribute('aria-hidden', 'true')
  input.style.cssText = PHOTO_INPUT_CSS
  document.body.appendChild(input)
  return input
}

/** Creates both shared inputs ahead of the first tap. Safe to call repeatedly. */
export function ensurePhotoInputs(): void {
  if (typeof document === 'undefined' || !document.body) return
  sharedInput('camera')
  sharedInput('library')
}

if (typeof document !== 'undefined') {
  if (document.body) ensurePhotoInputs()
  else document.addEventListener('DOMContentLoaded', ensurePhotoInputs, { once: true })
}

/** Settles the previous pick (as cancelled) when a new one starts, so no caller waits forever. */
let settlePending: ((file: File | null) => void) | null = null

/** How long after the page regains focus we still wait for 'change' before treating the pick as cancelled. */
const CANCEL_FALLBACK_MS = 5000

/**
 * Opens the camera / photo library. Everything up to and including `input.click()` runs
 * synchronously, so call this directly from the tap handler — never after an await.
 * Resolves null on cancel. The input is reset afterwards so the same photo can be picked twice.
 */
export function pickImageFile(source: PhotoSource): Promise<File | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  const input = sharedInput(source)
  settlePending?.(null)
  input.value = ''
  return new Promise((resolve) => {
    let settled = false
    let focusTimer: ReturnType<typeof setTimeout> | null = null
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      if (focusTimer) clearTimeout(focusTimer)
      window.removeEventListener('focus', onFocus)
      input.removeEventListener('change', onChange)
      input.removeEventListener('cancel', onCancel)
      if (settlePending === finish) settlePending = null
      input.value = ''
      resolve(file)
    }
    const onChange = () => finish(input.files?.[0] ?? null)
    const onCancel = () => finish(null)
    // Browsers without the 'cancel' event (iOS < 16.4): the window regains focus when the sheet
    // closes. Wait generously — iOS can take seconds to hand over a 12 MP photo — and never
    // detach the input, so a slow 'change' still wins over this timer.
    const onFocus = () => {
      if (focusTimer) clearTimeout(focusTimer)
      focusTimer = setTimeout(() => finish(input.files?.[0] ?? null), CANCEL_FALLBACK_MS)
    }
    input.addEventListener('change', onChange)
    input.addEventListener('cancel', onCancel)
    window.addEventListener('focus', onFocus)
    settlePending = finish
    input.click()
  })
}

async function loadBitmap(blob: Blob): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      return { width: bmp.width, height: bmp.height, draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), close: () => bmp.close() }
    } catch {
      /* fall back to <img>, e.g. option unsupported or codec issue */
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('This image format is not supported. Try a JPEG or PNG.'))
      el.src = url
    })
    return { width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), close: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

/** Downscales any decodable image blob to ≤ maxEdge px on the long side and re-encodes as JPEG. */
export async function downscaleImage(blob: Blob, maxEdge = MAX_EDGE, quality = JPEG_QUALITY): Promise<PickedImage> {
  const src = await loadBitmap(blob)
  try {
    if (!src.width || !src.height) throw new Error('Could not read the image.')
    const scale = Math.min(1, maxEdge / Math.max(src.width, src.height))
    const w = Math.max(1, Math.round(src.width * scale))
    const h = Math.max(1, Math.round(src.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available in this browser.')
    ctx.fillStyle = '#fff' // flatten transparency (PNG/WebP) to white before JPEG encoding
    ctx.fillRect(0, 0, w, h)
    src.draw(ctx, w, h)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    if (!base64) throw new Error('Could not encode the image.')
    return { dataUrl, base64, mediaType: 'image/jpeg', bytes: decodedBytes(base64), width: w, height: h }
  } finally {
    src.close()
  }
}

/**
 * Opens the camera (or photo library) and returns a downscaled JPEG.
 * Resolves `null` when the user cancels; throws when the file cannot be decoded.
 * Call directly from a click/tap handler — browsers block file pickers opened outside a user gesture.
 */
export async function pickImage(source: PhotoSource): Promise<PickedImage | null> {
  if (typeof document === 'undefined') return null
  const file = await pickImageFile(source) // runs synchronously up to input.click()
  if (!file) return null
  return imageFromFile(file)
}

/** Validates and downscales a File from any photo input. Throws a plain-language Error when it cannot be read. */
export function imageFromFile(file: File): Promise<PickedImage> {
  if (file.type && !file.type.startsWith('image/')) return Promise.reject(new Error('Please choose an image file.'))
  return downscaleImage(file)
}
