import { describe, expect, it } from 'vitest'
import { REDACTED_SETTING_KEYS } from '../files'

// A JSON export is meant to be shared or backed up; no credential may ever ride along in it.
describe('JSON export redaction list', () => {
  it('covers every AI credential and the hosted-bridge PIN', () => {
    for (const key of ['ai.apiKey', 'ai.geminiKey', 'ai.bridgePin']) expect(REDACTED_SETTING_KEYS).toContain(key)
  })
})
