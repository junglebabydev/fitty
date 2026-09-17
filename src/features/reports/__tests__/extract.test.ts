import { describe, expect, it } from 'vitest'
import { aiConnected } from '../../../ai'
import { REPORT_EXTRACTION_SCHEMA, REPORT_EXTRACTION_SYSTEM, clampSummary, extractReport, parseExtraction } from '../extract'
import { base64Bytes, dataUrlToAttachment, fmtBytes, titleFromFileName, uploadKind, validateUpload, MAX_UPLOAD_BYTES } from '../files'

const FALLBACK = '2026-09-17T03:00:00.000Z'

describe('parseExtraction', () => {
  it('normalises the reply and computes flags from the printed ranges, ignoring any flag the model sent', () => {
    const r = parseExtraction({
      kind: 'blood', title: ' Lipid panel ', report_date: '2026-08-02',
      summary: 'A lipid panel from Raffles Medical. Collected fasting. Your LDL is dangerously high.',
      markers: [
        { name: 'LDL', value: 3.9, value_text: '3.9', unit: 'mmol/L', ref_low: null, ref_high: 3.4, category: 'Lipids', flag: 'normal' },
        { name: 'HDL', value: 1.3, value_text: '1.3', unit: 'mmol/L', ref_low: 1.0, ref_high: null, category: 'Lipids' },
        { name: 'Smudged', value: null, value_text: '', unit: '', ref_low: null, ref_high: null, category: 'Lipids' },
      ],
    }, FALLBACK, 'fallback')
    expect(r.kind).toBe('blood')
    expect(r.title).toBe('Lipid panel')
    expect(new Date(r.ts).getDate()).toBe(2)
    expect(r.summary).toBe('A lipid panel from Raffles Medical. Collected fasting.')
    expect(r.markers.map((m) => m.flag)).toEqual(['high', 'normal', 'unknown'])
  })

  it('falls back for a bad kind, empty title and missing date; rejects non-objects', () => {
    const r = parseExtraction({ kind: 'mri??', title: '', report_date: null, summary: 42, markers: 'none' }, FALLBACK, 'scan 01')
    expect(r).toEqual({ kind: 'other', title: 'scan 01', ts: FALLBACK, summary: '', markers: [] })
    expect(() => parseExtraction('text', FALLBACK, 'x')).toThrow()
    expect(() => parseExtraction(null, FALLBACK, 'x')).toThrow()
  })

  it('clampSummary keeps at most two sentences', () => {
    expect(clampSummary('One. Two! Three?')).toBe('One. Two!')
    expect(clampSummary('No full stop')).toBe('No full stop')
    expect(clampSummary(undefined)).toBe('')
  })
})

describe('extraction contract', () => {
  it('the system prompt forbids interpretation and outside ranges', () => {
    expect(REPORT_EXTRACTION_SYSTEM).toMatch(/only what is printed/i)
    expect(REPORT_EXTRACTION_SYSTEM).toMatch(/never your own/i)
    expect(REPORT_EXTRACTION_SYSTEM).toMatch(/No diagnosis, no advice/)
  })

  it('the schema requires every field and does not ask the model for a flag', () => {
    const items = (REPORT_EXTRACTION_SCHEMA.properties as { markers: { items: { required: string[]; properties: Record<string, unknown> } } }).markers.items
    expect(items.required).toEqual(['name', 'value', 'value_text', 'unit', 'ref_low', 'ref_high', 'category'])
    expect(Object.keys(items.properties)).not.toContain('flag')
  })

  it('without a connected AI nothing is sent and the caller is told to go manual', async () => {
    expect(aiConnected()).toBe(false)
    await expect(extractReport({ base64: 'AAAA', mediaType: 'application/pdf', name: 'x.pdf' }, FALLBACK, 'x')).resolves.toEqual({ status: 'manual', reason: 'not_connected' })
  })
})

describe('upload validation', () => {
  it('accepts PDFs and images, by MIME type or by extension when the type is empty', () => {
    expect(uploadKind({ type: 'application/pdf', name: 'a.pdf' })).toBe('pdf')
    expect(uploadKind({ type: '', name: 'SCAN.PDF' })).toBe('pdf')
    expect(uploadKind({ type: 'image/heic', name: 'IMG_1.HEIC' })).toBe('image')
    expect(uploadKind({ type: '', name: 'photo.jpeg' })).toBe('image')
    expect(uploadKind({ type: 'text/csv', name: 'a.csv' })).toBeNull()
  })

  it('explains what is wrong in plain words', () => {
    expect(validateUpload({ type: 'application/pdf', name: 'a.pdf', size: 1000 })).toBeNull()
    expect(validateUpload({ type: 'application/zip', name: 'a.zip', size: 1000 })).toMatch(/PDF or a photo/)
    expect(validateUpload({ type: 'application/pdf', name: 'a.pdf', size: 0 })).toMatch(/empty/)
    expect(validateUpload({ type: 'application/pdf', name: 'a.pdf', size: MAX_UPLOAD_BYTES + 1 })).toMatch(/15 MB/)
    expect(validateUpload({ type: 'application/pdf', name: 'a.pdf', size: MAX_UPLOAD_BYTES })).toBeNull()
  })

  it('small helpers', () => {
    expect(base64Bytes('QUJD')).toBe(3)
    expect(base64Bytes('QUI=')).toBe(2)
    expect(fmtBytes(512)).toBe('1 KB')
    expect(fmtBytes(3.5 * 1024 * 1024)).toBe('3.5 MB')
    expect(titleFromFileName('blood-panel_2026.pdf')).toBe('blood panel 2026')
    expect(titleFromFileName('.pdf')).toBe('Report')
    expect(dataUrlToAttachment('data:image/jpeg;base64,QUJD', 'a.jpg')).toEqual({ mediaType: 'image/jpeg', base64: 'QUJD', name: 'a.jpg' })
    expect(dataUrlToAttachment('https://example.com/a.jpg')).toBeNull()
  })
})
