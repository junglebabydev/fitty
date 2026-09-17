// Camera → AI recognition → review screen. The review screen mounts immediately
// with a 'recognizing' draft (skeleton rows) and is updated through the draft
// store when the provider answers or fails. Nothing here throws to the caller.
//
// When no real model is connected the draft is NOT filled with demo numbers: it
// carries errorKind 'not_configured' and an empty item list, so the review screen
// says so plainly and the user adds items (or connects AI and retries).

import type { NavigateFunction } from 'react-router-dom'
import { imageFromFile, pickImageFile } from '../../native/camera'
import { aiConnected, getProvider, recognizeMeal } from '../../ai/gateway'
import { AI_ERROR_MESSAGES, isAIError, type AIErrorKind, type MealImage } from '../../ai/types'
import { addLedgerEntry } from '../../db/repositories/ledger'
import { getSetting } from '../../db/repositories/settings'
import { nowIso } from '../../lib/util'
import type { PickedImage } from '../../native/camera'
import { draftFromRecognition, draftWithError, loadDraft, newDraft, saveDraft, updateDraft } from './draft'

export const REVIEW_PATH = '/eat/review'

/** Bumped on every capture / cancel so a stale recognition never overwrites a newer draft. */
let captureSeq = 0
let inFlight = false

export function isRecognitionInFlight(): boolean {
  return inFlight
}

/** Drops the pending result (if any) and lets the user proceed manually. */
export function cancelRecognition(): void {
  captureSeq += 1
  inFlight = false
  updateDraft((d) => (d.status === 'recognizing' ? { ...d, status: 'ready' } : d))
}

function errorKindOf(e: unknown): { kind: AIErrorKind; message: string } {
  if (isAIError(e)) return { kind: e.kind, message: e.message || AI_ERROR_MESSAGES[e.kind] }
  const message = e instanceof Error && e.message ? e.message : AI_ERROR_MESSAGES.unknown
  return { kind: 'unknown', message }
}

/** Splits a data: URL into the gateway's image shape. */
export function imageFromDataUrl(dataUrl: string): MealImage | null {
  const m = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s.exec(dataUrl)
  if (!m || !m[2]) return null
  return { mediaType: m[1] || 'image/jpeg', base64: m[2] }
}

export const AI_NOT_CONNECTED_MESSAGE = 'AI is not connected — add items yourself or connect AI in Settings.'
export const PHOTOS_OFF_MESSAGE = 'Sending meal photos to AI is turned off — add items yourself, or turn it on in Settings.'

function ledgerLocalOnly(image: MealImage, why: string): void {
  try {
    addLedgerEntry({
      ts: nowIso(), provider: getProvider().id, dataType: 'meal_photo',
      purpose: `Meal photo kept on this device (${why})`,
      bytes: image.base64.length, status: 'local_only',
    })
  } catch (err) {
    console.warn('privacy ledger write failed', err)
  }
}

/**
 * Runs recognition for the current draft. Without a connected model, or with
 * 'ai.sendMealPhotos' off, the photo never leaves the device and the draft is
 * flagged 'not_configured' with no items — never demo numbers dressed as real ones.
 */
async function recognizeInto(image: MealImage, seq: number): Promise<void> {
  const draft = loadDraft()
  if (!draft) return
  const ctx = { mealType: draft.mealType }
  const blocked = !aiConnected() ? { why: 'AI not connected', message: AI_NOT_CONNECTED_MESSAGE }
    : !getSetting<boolean>('ai.sendMealPhotos', true) ? { why: 'sending photos is off', message: PHOTOS_OFF_MESSAGE }
    : null
  if (blocked) {
    ledgerLocalOnly(image, blocked.why)
    if (seq !== captureSeq) return
    inFlight = false
    updateDraft((d) => draftWithError({ ...d, items: [], confidence: null, recognitionNotes: null }, 'not_configured', blocked.message))
    return
  }
  inFlight = true
  try {
    const recognition = await recognizeMeal(image, ctx)
    if (seq !== captureSeq) return
    updateDraft((d) => draftFromRecognition(d, recognition))
  } catch (e) {
    if (seq !== captureSeq) return
    const { kind, message } = errorKindOf(e)
    updateDraft((d) => draftWithError(d, kind, message))
  } finally {
    if (seq === captureSeq) inFlight = false
  }
}

/**
 * A photo has been picked (from a <PhotoInput> or `pickImageFile`): open the review
 * screen straight away with a 'recognizing' draft, then downscale, then recognise.
 */
export async function captureMealFromFile(navigate: NavigateFunction, file: File): Promise<void> {
  captureSeq += 1
  const seq = captureSeq
  inFlight = true
  saveDraft(newDraft({ status: 'recognizing', ts: nowIso(), source: 'photo' }))
  navigate(REVIEW_PATH)

  let img: PickedImage
  try {
    img = await imageFromFile(file)
  } catch (e) {
    // The file could not be decoded (e.g. HEIC on a non-Safari browser). Show the reason on the review screen.
    if (seq !== captureSeq) return
    inFlight = false
    const message = e instanceof Error && e.message ? e.message : 'Could not read that image.'
    updateDraft((d) => draftWithError(d, 'unknown', message))
    return
  }
  if (seq !== captureSeq) return
  updateDraft((d) => ({ ...d, photoDataUrl: img.dataUrl }))
  await recognizeInto({ base64: img.base64, mediaType: img.mediaType }, seq)
}

/**
 * Opens the camera or photo library, then hands the photo to `captureMealFromFile`.
 * Call it directly from the tap handler: `pickImageFile` clicks the persistent file
 * input synchronously, before the first await. Resolves once recognition has finished or failed.
 */
export async function startMealCapture(navigate: NavigateFunction, source: 'camera' | 'library'): Promise<void> {
  const file = await pickImageFile(source)
  if (!file) return
  await captureMealFromFile(navigate, file)
}

/**
 * Re-runs recognition on the draft's stored photo (after fixing connectivity or
 * the API key). Returns false when there is no photo to retry with.
 */
export async function retryRecognition(): Promise<boolean> {
  const draft = loadDraft()
  if (!draft?.photoDataUrl) return false
  const image = imageFromDataUrl(draft.photoDataUrl)
  if (!image) return false
  captureSeq += 1
  const seq = captureSeq
  const { errorKind: _k, errorMessage: _m, ...rest } = draft
  saveDraft({ ...rest, status: 'recognizing' })
  await recognizeInto(image, seq)
  return true
}
