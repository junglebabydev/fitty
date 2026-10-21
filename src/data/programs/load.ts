// The rest of the programmes, fetched on demand. Separate from index.ts so App.tsx can import it without BFT's data.
// Once the service worker has precached the app this never touches the network. If the fetch fails before that (a
// first visit with a bad connection), browsers keep the failed module for the session: the routes that await it show
// their error screen, and "Reload app" fetches it again. Resetting `pending` only matters where a browser does retry.
let pending: Promise<void> | null = null

export function loadAllPrograms(): Promise<void> {
  pending ??= import('./all').then(() => undefined, (e: unknown) => { pending = null; throw e })
  return pending
}
