// Drives the real bridge middleware over HTTP with a stub `claude` binary: no model, no network.
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const STUB = `#!/usr/bin/env node
const fs = require('node:fs')
const args = process.argv.slice(2)
if (args[0] === '--version') { console.log('9.9.9 (stub)'); process.exit(0) }
const system = args[args.indexOf('--system-prompt') + 1] || ''
let stdin = ''
process.stdin.on('data', (d) => { stdin += d })
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.COACH_STUB_LOG, JSON.stringify({ flags: args.filter((a, i) => args[i - 1] !== '--system-prompt'), cwd: process.cwd(), files: fs.readdirSync(process.cwd()), stdin }) + '\\n')
  const flag = args.includes('--json-schema')
  const done = (over, code) => { console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0.001, modelUsage: { 'stub-haiku': { outputTokens: 12 }, 'stub-sonnet': { outputTokens: 900 } }, ...over })); process.exit(code || 0) }
  if (flag && /STUB_OLDCLI/.test(system)) { console.error("error: unknown option '--json-schema'"); process.exit(1) }
  if (/connectivity check/.test(system)) return done({ result: process.env.COACH_STUB_HEALTH === 'empty' ? '  ' : 'OK' })
  if (/STUB_EMPTY/.test(system)) return done({ result: '' })
  if (/STUB_PROSE/.test(system)) return done({ result: 'Done! Here is a summary instead of JSON.' })
  if (/STUB_AUTH/.test(system)) return done({ is_error: true, result: 'Invalid API key · Please run /login' }, 1)
  if (/STUB_SLOW/.test(system)) return setTimeout(() => done({ result: 'slow' }), 400)
  if (flag) return done({ result: 'DONE', structured_output: { ok: true, via: 'flag' } })
  done({ result: stdin.includes('JSON Schema') ? '\`\`\`json\\n{"ok":true,"via":"prompt"}\\n\`\`\`' : 'Plain coach reply.' })
})
`

let server: Server
let base = ''
let work = ''
let log = ''
let mw: Middleware

const calls = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as { flags: string[]; cwd: string; files: string[]; stdin: string }) : [])
const post = (path: string, body: unknown) => fetch(`${base}/api/ai${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) })
const health = async (deep = true) => (await (await fetch(`${base}/api/ai/health${deep ? '?deep=1' : ''}`)).json()) as { ok: boolean; auth: string; message: string; host: string }
const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'bridge-test-'))
  log = join(work, 'calls.jsonl')
  const bin = join(work, 'claude-stub.cjs')
  writeFileSync(bin, STUB)
  chmodSync(bin, 0o755)
  Object.assign(process.env, { COACH_CLAUDE_BIN: bin, COACH_STUB_LOG: log, COACH_STUB_HEALTH: 'empty' })
  delete process.env.COACH_BRIDGE_PIN
  delete process.env.COACH_BRIDGE_SCHEMA
  delete process.env.COACH_CLAUDE_EFFORT
  const { aiBridge } = await import('../aiBridge') // after the env: the module reads it once
  const hook = aiBridge().configureServer as unknown as (s: { middlewares: { use: (fn: Middleware) => void } }) => void
  hook({ middlewares: { use: (fn) => { mw = fn } } })
  server = createServer((req, res) => mw(req, res, () => { res.statusCode = 404; res.end() }))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  rmSync(work, { recursive: true, force: true })
})

describe('AI bridge over HTTP (stub CLI)', () => {
  it('an empty or failed reply is never reported, or cached, as healthy', async () => {
    const first = await health()
    expect(first).toMatchObject({ ok: false, auth: 'unknown', host: 'mac' })
    expect(first.message).toMatch(/empty reply/)

    const empty = await post('/chat', { system: 'STUB_EMPTY', turns: [{ role: 'user', content: 'hi' }] })
    expect(empty.status).toBe(502)
    const prose = await post('/json', { system: 'STUB_PROSE', prompt: 'x', schema: SCHEMA })
    expect(prose.status).toBe(502)
    expect(await prose.json()).toMatchObject({ ok: false, kind: 'failed' })
    expect((await health()).ok).toBe(false)

    const auth = await post('/chat', { system: 'STUB_AUTH', turns: [{ role: 'user', content: 'hi' }] })
    expect(auth.status).toBe(401)
    expect(await health()).toMatchObject({ ok: false, auth: 'signed_out' })
  })

  it('a text-only structured call uses --json-schema, low effort and reports the main model; a real answer marks the bridge healthy', async () => {
    const res = await post('/json', { system: 'Route it.', prompt: 'hello', schema: SCHEMA })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, data: { ok: true, via: 'flag' }, meta: { model: 'stub-sonnet', structured: true } })
    const call = calls().at(-1)!
    expect(call.flags).toEqual(expect.arrayContaining(['--json-schema', JSON.stringify(SCHEMA), '--effort', 'low', '--max-turns', '4', '--tools', '', '--strict-mcp-config', '--no-session-persistence']))
    expect(call.stdin).toBe('hello')
    expect(await health()).toMatchObject({ ok: true, auth: 'ok', message: expect.stringMatching(/^Connected/) })
  })

  it('attachments reach the model in a throw-away directory that is gone when the call returns', async () => {
    const res = await post('/json', { system: 'Transcribe.', prompt: 'read it', schema: SCHEMA, attachments: [{ base64: `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`, mediaType: 'image/png' }] })
    expect(await res.json()).toMatchObject({ ok: true, data: { via: 'prompt' }, meta: { structured: false } })
    const call = calls().at(-1)!
    expect(call.files).toEqual(['input-1.png'])
    expect(call.flags).toEqual(expect.arrayContaining(['--tools', 'Read', '--allowedTools', '--max-turns', '5']))
    expect(call.flags).not.toContain('--json-schema')
    expect(call.stdin).toMatch(/\.\/input-1\.png.*Read tool[\s\S]*JSON Schema/)
    expect(existsSync(call.cwd)).toBe(false)

    const bad = await post('/json', { system: 's', prompt: 'p', schema: SCHEMA, attachments: [{ base64: 'AAAA', mediaType: 'application/zip' }] })
    expect(bad.status).toBe(400)
    for (const c of calls()) expect(existsSync(c.cwd), c.cwd).toBe(false)
  })

  it('chat passes the conversation through and never asks for low effort', async () => {
    const res = await post('/chat', { system: 'Coach.', turns: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }] })
    expect(await res.json()).toMatchObject({ ok: true, text: 'Plain coach reply.', meta: { model: 'stub-sonnet' } })
    const call = calls().at(-1)!
    expect(call.stdin).toMatch(/User: a\n\nCoach: b\n\nUser: c/)
    expect(call.flags).not.toContain('--effort')
    expect(call.flags).toEqual(expect.arrayContaining(['--max-turns', '1']))
  })

  it('allows two calls at a time and turns a third away', async () => {
    const slow = () => post('/chat', { system: 'STUB_SLOW', turns: [{ role: 'user', content: 'x' }] })
    const statuses = (await Promise.all([slow(), slow(), slow()])).map((r) => r.status).sort()
    expect(statuses).toEqual([200, 200, 429])
  })

  it('same-origin only, on HTTP/1.1 (Host) and HTTP/2 (:authority)', async () => {
    const cross = await fetch(`${base}/api/ai/health`, { headers: { Origin: 'https://evil.example' } })
    expect(cross.status).toBe(403)
    const h2 = (headers: Record<string, string>) => new Promise<number>((resolve) => {
      const res = { statusCode: 0, setHeader() {}, end() { resolve(this.statusCode) } }
      mw({ url: '/api/ai/health', method: 'GET', headers, socket: { remoteAddress: '192.168.1.20' } } as unknown as IncomingMessage, res as unknown as ServerResponse, () => resolve(-1))
    })
    expect(await h2({ origin: 'https://192.168.1.5:5173', ':authority': '192.168.1.5:5173' })).toBe(200)
    expect(await h2({ origin: 'https://evil.example', ':authority': '192.168.1.5:5173' })).toBe(403)
    const outside = await new Promise<number>((resolve) => {
      const res = { statusCode: 0, setHeader() {}, end() { resolve(this.statusCode) } }
      mw({ url: '/api/ai/health', method: 'GET', headers: {}, socket: { remoteAddress: '8.8.8.8' } } as unknown as IncomingMessage, res as unknown as ServerResponse, () => resolve(-1))
    })
    expect(outside).toBe(403)
  })

  it('a Claude Code too old for --json-schema falls back to prompt JSON, once, for the rest of the process', async () => {
    const res = await post('/json', { system: 'STUB_OLDCLI', prompt: 'hello', schema: SCHEMA })
    expect(await res.json()).toMatchObject({ ok: true, data: { via: 'prompt' }, meta: { structured: false } })
    const before = calls().length
    await post('/json', { system: 'Route it.', prompt: 'again', schema: SCHEMA })
    expect(calls().length).toBe(before + 1)
    expect(calls().at(-1)!.flags).not.toContain('--json-schema')
  })
})
