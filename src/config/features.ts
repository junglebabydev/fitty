// Navigation switches for the single-user build. Off hides the entry points only: the screens, routes
// (/reports, /settings/privacy) and tables stay, so turning one back on is a one-line change.
export const FEATURES = { reports: false, privacyLedger: false } as const
