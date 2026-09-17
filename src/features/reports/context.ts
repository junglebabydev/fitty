// Coach context from reports. Returns nothing unless the user turned on 'ai.shareReports' (default false, asked at upload).
import { getSetting, listReports } from '../../db/repositories'
import { buildReportContextLines } from './markers'

export const SHARE_REPORTS_KEY = 'ai.shareReports'
export const REPORT_CONSENT_KEY = 'reports.aiConsentAsked'

export function shareReportsEnabled(): boolean {
  return getSetting<unknown>(SHARE_REPORTS_KEY, false) === true
}

/** One line per report (title, date, 3–5 notable markers with their printed-range flags). Empty when sharing is off. */
export function reportContextLines(): string[] {
  if (!shareReportsEnabled()) return []
  return buildReportContextLines(listReports(), true)
}
