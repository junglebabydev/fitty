// Theme: 'system' (default) | 'dark' | 'light', stored in localStorage (not the DB) so public/theme-boot.js
// (loaded by index.html) can apply it before the stylesheet with no flash (keep the two in sync).
// <html data-theme="dark|light"> drives both the CSS tokens and Tailwind's `dark:` variant (see index.css).

export type ThemePref = 'system' | 'dark' | 'light'
const KEY = 'ui.theme'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'dark' || v === 'light' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

function resolve(pref: ThemePref): 'dark' | 'light' {
  if (pref !== 'system') return pref
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(pref: ThemePref = getThemePref()): void {
  const mode = resolve(pref)
  document.documentElement.dataset.theme = mode
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0a0b0d' : '#f2f2f7')
}

export function setThemePref(pref: ThemePref): void {
  try { localStorage.setItem(KEY, pref) } catch { /* private mode */ }
  applyTheme(pref)
}

/** Call once at startup; keeps 'system' in sync with the OS. */
export function initTheme(): void {
  applyTheme()
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (getThemePref() === 'system') applyTheme('system')
  })
}
