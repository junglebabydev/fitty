// Navigation switches for the single-user build. Off hides the entry points only: the screens, routes
// (/reports, /settings/privacy, /mind, /sleep) and tables stay, so turning one back on is a one-line change.
// mind: the Mind tab and Today's Mind tile. sleepTile: Today's Rest tile (sleep still feeds readiness).
// healthWrites: Settings → Health's "Write to Health" group. The iPhone app only reads HealthKit for now.
export const FEATURES = { reports: false, privacyLedger: false, mind: false, sleepTile: false, healthWrites: false } as const
