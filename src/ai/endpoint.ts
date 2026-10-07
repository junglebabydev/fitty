// Where the hosted AI lives. On the web it is the same origin (/api/ai). The iPhone app is served from
// capacitor://localhost, so its build (mode 'ios', docs/IOS.md) sets the Worker's address in VITE_API_BASE.
const base = import.meta.env.VITE_API_BASE ?? ''

export function aiUrl(path: string): string {
  return `${base}/api/ai${path}`
}

/** The hostname that serves /api/ai: the Worker's in the iPhone app, the page's own on the web. */
export function aiHostname(): string {
  if (base) return new URL(base).hostname
  return typeof location === 'undefined' ? '' : location.hostname
}
