import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { AnthropicProvider, mapAnthropicError, parseMealRecognition, stripDataUrl, toImageMediaType } from '../anthropic'
import { AIError } from '../types'

describe('parseMealRecognition', () => {
  it('parses a clean JSON object', () => {
    const r = parseMealRecognition(
      JSON.stringify({
        items: [{ food_name: 'Chicken rice', estimated_quantity_g: 350, serving_description: '1 plate', kcal: 600, protein_g: 30, carbs_g: 70, fat_g: 20, confidence_0_1: 0.7, uncertainty_reason: 'skin unclear', source_hint: 'SG hawker' }],
        overall_confidence: 0.7,
        notes: 'ok',
      }),
    )
    expect(r.items).toHaveLength(1)
    expect(r.items[0].food_name).toBe('Chicken rice')
    expect(r.overall_confidence).toBe(0.7)
  })

  it('tolerates code fences and surrounding prose', () => {
    const r = parseMealRecognition('Here you go:\n```json\n{"items":[],"overall_confidence":0.2,"notes":"No food visible"}\n```')
    expect(r.items).toEqual([])
    expect(r.notes).toBe('No food visible')
  })

  it('coerces bad values and clamps confidence', () => {
    const r = parseMealRecognition('{"items":[{"food_name":"Eggs","kcal":"140","confidence_0_1":7,"protein_g":-1}],"overall_confidence":"x"}')
    expect(r.items[0].kcal).toBe(140)
    expect(r.items[0].confidence_0_1).toBe(1)
    expect(r.items[0].protein_g).toBe(0)
    expect(r.items[0].estimated_quantity_g).toBe(0)
    expect(r.overall_confidence).toBe(0.5)
  })

  it('throws AIError(unknown) on garbage', () => {
    expect(() => parseMealRecognition('not json at all')).toThrowError(AIError)
  })
})

describe('mapAnthropicError', () => {
  it('maps SDK typed errors to AIError kinds', () => {
    expect(mapAnthropicError(new Anthropic.AuthenticationError(401, undefined, 'bad key', undefined as unknown as Headers)).kind).toBe('auth')
    expect(mapAnthropicError(new Anthropic.RateLimitError(429, undefined, 'slow down', undefined as unknown as Headers)).kind).toBe('rate_limit')
    expect(mapAnthropicError(new Anthropic.APIConnectionError({ message: 'ECONNRESET' })).kind).toBe('network')
    expect(mapAnthropicError(new Anthropic.APIConnectionTimeoutError()).kind).toBe('network')
    expect(mapAnthropicError(new Anthropic.InternalServerError(529, undefined, 'overloaded', undefined as unknown as Headers)).kind).toBe('network')
    expect(mapAnthropicError(new Anthropic.BadRequestError(400, undefined, 'bad param', undefined as unknown as Headers)).kind).toBe('unknown')
    expect(mapAnthropicError(new Error('boom')).kind).toBe('unknown')
  })

  it('passes AIError through unchanged', () => {
    const e = new AIError('refusal')
    expect(mapAnthropicError(e)).toBe(e)
  })
})

describe('AnthropicProvider', () => {
  it('reports configuration from the key and applies the default model', () => {
    expect(new AnthropicProvider('').isConfigured()).toBe(false)
    expect(new AnthropicProvider('   ').isConfigured()).toBe(false)
    const p = new AnthropicProvider('sk-ant-x')
    expect(p.isConfigured()).toBe(true)
    expect(p.model).toBe('claude-opus-5')
    expect(new AnthropicProvider('sk-ant-x', 'claude-sonnet-4-5').model).toBe('claude-sonnet-4-5')
  })

  it('rejects with not_configured without touching the network', async () => {
    const err = await new AnthropicProvider('').coachChat('sys', [{ role: 'user', content: 'hi' }]).catch((e: unknown) => e)
    expect((err as AIError).kind).toBe('not_configured')
  })

  it('normalises media types and strips data URLs', () => {
    expect(toImageMediaType('image/jpg')).toBe('image/jpeg')
    expect(toImageMediaType('image/png')).toBe('image/png')
    expect(toImageMediaType('image/heic')).toBe('image/jpeg')
    expect(stripDataUrl('data:image/jpeg;base64,QUJD')).toBe('QUJD')
    expect(stripDataUrl('QUJD')).toBe('QUJD')
  })
})
