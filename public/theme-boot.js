// Pre-boot theme (mirrors src/lib/theme.ts; keep the two in sync). Loaded as a classic, blocking script from
// index.html before the stylesheet so the first paint is already the right mode. A separate file, not inline,
// because the CSP in public/_headers allows only script-src 'self'.
// It also starts downloading the local database engine, so it arrives alongside the app's script instead of after
// it; src/db/database.ts takes the response once. (A <link rel=preload> does this in Chrome, but Safari, the iPhone
// app included, ignores the preload and downloads the file twice.)
try { window.__sqlWasm = fetch('/sql-wasm.wasm', { credentials: 'same-origin' }).catch(function () { return null }) } catch (e) {}
(function () {
  var pref = 'system'
  try { var v = localStorage.getItem('ui.theme'); if (v === 'dark' || v === 'light' || v === 'system') pref = v } catch (e) {}
  var mode = pref !== 'system' ? pref : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.dataset.theme = mode
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0a0b0d' : '#f2f2f7')
})()
