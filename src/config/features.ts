// Navigation switches for the single-user build. Off hides the entry points only: the screens, routes
// (/reports, /settings/privacy, /mind, /sleep) and tables stay, so turning one back on is a one-line change.
// mind: the Mind tab and Today's Mind tile. sleepTile: Today's Rest tile (sleep still feeds readiness).
// blueprint: `/` is the Blueprint week (screens/Blueprint.tsx) instead of the Today hub (screens/Today.tsx).
// train, eat: their tabs. With train off, exact /train goes to `/`, so every "Back to Train" exit lands on Today.
// coachBrief: Coach's daily brief and proposals row, which read the old weekly plan.
export const FEATURES = {
  reports: false, privacyLedger: false, mind: false, sleepTile: false,
  blueprint: true, train: false, eat: false, coachBrief: false,
} as const
