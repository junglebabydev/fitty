// The rest of the programmes, fetched on demand. Separate from index.ts so App.tsx can import it without BFT's data.
let pending: Promise<void> | null = null

export function loadAllPrograms(): Promise<void> {
  pending ??= import('./all').then(() => undefined, (e: unknown) => { pending = null; throw e })
  return pending
}
