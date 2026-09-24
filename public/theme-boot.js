// Pre-boot theme (mirrors src/lib/theme.ts; keep the two in sync). Loaded as a classic, blocking script from
// index.html before the stylesheet so the first paint is already the right mode. A separate file, not inline,
// because the CSP in public/_headers allows only script-src 'self'.
(function () {
  var pref = 'system'
  try { var v = localStorage.getItem('ui.theme'); if (v === 'dark' || v === 'light' || v === 'system') pref = v } catch (e) {}
  var mode = pref !== 'system' ? pref : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.dataset.theme = mode
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0a0b0d' : '#f2f2f7')
})()
