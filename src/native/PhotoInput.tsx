// React photo primitive: a REAL <input type="file"> that stays mounted and is opened
// directly by the user's tap. Works on an iPhone over plain http (no getUserMedia).
//
//   const photos = usePhotoPicker((file, source) => …)
//   return <>{photos.inputs} <button onClick={photos.openCamera}>Snap</button></>
//
// Rules that keep iOS Safari happy:
//   • render `photos.inputs` somewhere that does NOT unmount when a sheet closes;
//   • call `openCamera()` / `openLibrary()` as the FIRST statement of the click handler
//     (never after an await, a timeout or a close animation) — or use
//     <label htmlFor={photos.cameraId}> and let the browser do it;
//   • the input is visually hidden with the sr-only technique, never display:none.
import { useCallback, useId, useRef, type ReactNode, type RefObject } from 'react'
import { PHOTO_INPUT_STYLE, type PhotoSource } from './camera'

export interface PhotoInputProps {
  source: PhotoSource
  id?: string
  inputRef?: RefObject<HTMLInputElement>
  onFile: (file: File, source: PhotoSource) => void
}

/** `capture="environment"` for the camera; no `capture` for the photo library. */
export function PhotoInput({ source, id, inputRef, onFile }: PhotoInputProps) {
  return (
    <input
      ref={inputRef}
      id={id}
      type="file"
      accept="image/*"
      capture={source === 'camera' ? 'environment' : undefined}
      tabIndex={-1}
      aria-hidden
      style={PHOTO_INPUT_STYLE}
      onChange={(e) => {
        const input = e.currentTarget
        const file = input.files?.[0] ?? null
        input.value = '' // so the same photo can be picked twice in a row
        if (file) onFile(file, source)
      }}
    />
  )
}

export interface PhotoPicker {
  /** Render once, outside anything that unmounts on tap (sheets, menus). */
  inputs: ReactNode
  /** Synchronous — call first thing in the tap handler. */
  openCamera: () => void
  openLibrary: () => void
  /** For <label htmlFor>. */
  cameraId: string
  libraryId: string
}

export function usePhotoPicker(onFile: (file: File, source: PhotoSource) => void): PhotoPicker {
  const uid = useId()
  const cameraId = `${uid}-camera`
  const libraryId = `${uid}-library`
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const openCamera = useCallback(() => { cameraRef.current?.click() }, [])
  const openLibrary = useCallback(() => { libraryRef.current?.click() }, [])
  const inputs = (
    <>
      <PhotoInput source="camera" id={cameraId} inputRef={cameraRef} onFile={onFile} />
      <PhotoInput source="library" id={libraryId} inputRef={libraryRef} onFile={onFile} />
    </>
  )
  return { inputs, openCamera, openLibrary, cameraId, libraryId }
}
