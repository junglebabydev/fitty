// AI extraction of an uploaded report: transcription only. The model copies what is printed (values, units and the
// report's OWN reference ranges); flags are computed here, deterministically, from those printed numbers.
import { aiConnected, aiJson, type AIAttachment } from '../../ai'
import type { ReportKind, ReportMarker } from '../../domain/types'
import { isReportKind, normaliseMarkers, reportTs } from './markers'

export const REPORT_LEDGER_META = { dataType: 'health_report', purpose: 'Extract values from an uploaded report' } as const

export const REPORT_EXTRACTION_SYSTEM = [
  'You transcribe health documents (blood tests, body-composition scans such as DEXA or InBody, clinician or physio notes, imaging reports) into structured data.',
  'Transcribe only what is printed on the document. Do not infer, estimate, convert units or fill gaps.',
  'Use the reference range printed on the report for each value, never your own knowledge of typical ranges. If no range is printed for a value, set ref_low and ref_high to null.',
  'For a one-sided printed range (for example "< 5.2" or "> 1.0") fill only that side and leave the other null.',
  'If a value is unreadable or not numeric, set value to null and put exactly what is printed (or an empty string) in value_text.',
  'The summary is at most two plain sentences saying what the document is (type of report, issuing lab or clinic if printed, what it covers). It is not an interpretation.',
  'No diagnosis, no advice, no commentary on whether any value is good or bad. Do not copy flags such as H, L or * into any field: the app computes them from the printed range.',
  'Leave out personal identifiers: no patient name, ID or record number, date of birth, address or doctor name in the title or the summary.',
  'Plain text only. No emoji.',
  'report_date is the collection or report date printed on the document as YYYY-MM-DD, or null if none is printed.',
].join(' ')

export const REPORT_EXTRACTION_PROMPT =
  'Transcribe the attached document. Group markers with the section heading printed on the report as the category (for example "Lipids", "Full blood count", "Body composition"); use "Other" when there is no heading.'

const nullableNumber = { type: ['number', 'null'] }

export const REPORT_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'title', 'report_date', 'summary', 'markers'],
  properties: {
    kind: { type: 'string', enum: ['blood', 'body_composition', 'clinical_note', 'imaging', 'other'] },
    title: { type: 'string' },
    report_date: { type: ['string', 'null'], description: 'YYYY-MM-DD as printed, or null' },
    summary: { type: 'string', description: 'At most two plain sentences describing what the document is. Not an interpretation.' },
    markers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'value', 'value_text', 'unit', 'ref_low', 'ref_high', 'category'],
        properties: {
          name: { type: 'string' },
          value: nullableNumber,
          value_text: { type: 'string' },
          unit: { type: 'string' },
          ref_low: nullableNumber,
          ref_high: nullableNumber,
          category: { type: 'string' },
        },
      },
    },
  },
}

export interface ExtractedReport {
  kind: ReportKind
  title: string
  /** ISO timestamp: the printed report date at local noon, or `fallbackIso`. */
  ts: string
  summary: string
  markers: ReportMarker[]
}

/** Keeps at most two sentences so a chatty reply cannot smuggle an interpretation onto the screen. */
export function clampSummary(s: unknown): string {
  if (typeof s !== 'string') return ''
  const sentences = s.trim().match(/[^.!?]+[.!?]*/g) ?? []
  return sentences.slice(0, 2).join('').trim().slice(0, 320)
}

/** Validates and normalises the model's reply. Pure. Throws when the reply is not an object. */
export function parseExtraction(raw: unknown, fallbackIso: string, fallbackTitle: string): ExtractedReport {
  if (!raw || typeof raw !== 'object') throw new Error('The AI reply could not be read.')
  const r = raw as Record<string, unknown>
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 80) : fallbackTitle
  return {
    kind: isReportKind(r.kind) ? r.kind : 'other',
    title,
    ts: reportTs(r.report_date, fallbackIso),
    summary: clampSummary(r.summary),
    markers: normaliseMarkers(r.markers),
  }
}

export type ExtractionOutcome =
  | { status: 'extracted'; report: ExtractedReport }
  | { status: 'manual'; reason: 'not_connected' }
  | { status: 'failed'; reason: string }

/** Never throws: without AI (or when the call fails) the caller saves the report for manual entry. */
export async function extractReport(file: AIAttachment, fallbackIso: string, fallbackTitle: string): Promise<ExtractionOutcome> {
  if (!aiConnected()) return { status: 'manual', reason: 'not_connected' }
  try {
    const raw = await aiJson<unknown>(
      { system: REPORT_EXTRACTION_SYSTEM, prompt: REPORT_EXTRACTION_PROMPT, schema: REPORT_EXTRACTION_SCHEMA, attachments: [file] },
      REPORT_LEDGER_META,
    )
    return { status: 'extracted', report: parseExtraction(raw, fallbackIso, fallbackTitle) }
  } catch (e) {
    return { status: 'failed', reason: e instanceof Error && e.message ? e.message : 'Extraction did not finish.' }
  }
}
