// The self-hosted server end to end over real HTTP: static files, the proxy headers the Worker's checks depend on,
// the file-backed daily budget and the in-process coach. Upstream AI calls hit a stubbed fetch.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DAILY_CALL_LIMIT } from '../../worker/guard'
import { budgetNamespace, createHost, hostEnv } from '../host'

const HOST = 'fitty.example'
const PIN = 'a-long-enough-pin'
const proxied = { Host: HOST, 'X-Forwarded-Proto': 'https', Origin: `https://${HOST}`, 'x-coach-pin': PIN }
const chatBody = { system: 'coach', turns: [{ role: 'user', content: 'hi' }] }
const orOk = (content: string) => new Response(JSON.stringify({ model: 'm', choices: [{ finish_reason: 'stop', message: { content } }] }), { status: 200 })

const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
let dir: string
let server: Server

interface Reply { status: number; headers: Record<string, string | string[] | undefined>; text: string }

/** node:http instead of fetch: fetch is stubbed for the upstream, and it would not let the test set Host. */
function call(path: string, { method = 'GET', headers = {}, body }: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): Promise<Reply> {
  const { port } = server.address() as AddressInfo
  const payload = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((done, fail) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method, headers: { ...(payload ? { 'Content-Type': 'application/json' } : {}), ...headers } }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => (text += chunk))
      res.on('end', () => done({ status: res.statusCode ?? 0, headers: res.headers, text }))
    })
    req.on('error', fail)
    req.end(payload)
  })
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fitty-host-'))
  mkdirSync(join(dir, 'dist', 'assets'), { recursive: true })
  writeFileSync(join(dir, 'dist', 'index.html'), '<!doctype html><title>shell</title>')
  writeFileSync(join(dir, 'dist', 'sw.js'), 'self.x = 1')
  writeFileSync(join(dir, 'dist', 'sql-wasm.wasm'), 'wasm')
  writeFileSync(join(dir, 'dist', 'assets', 'app-1234.js'), 'console.log(1)')
  writeFileSync(join(dir, 'secret.txt'), 'outside dist')
  upstream.mockReset()
  vi.stubGlobal('fetch', upstream)
  server = createHost({ distDir: join(dir, 'dist'), dataDir: join(dir, 'data'), vars: { COACH_BRIDGE_PIN: PIN, OPENROUTER_API_KEY: 'TEST-ONLY-OPENROUTER-KEY' } })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
})
afterEach(async () => {
  await new Promise((closed) => server.close(closed))
  vi.unstubAllGlobals()
  rmSync(dir, { recursive: true, force: true })
})

describe('static files', () => {
  it('serves the build with the right types, caching hashed assets for good and revalidating the rest', async () => {
    const js = await call('/assets/app-1234.js')
    expect([js.status, js.headers['content-type'], js.headers['cache-control']]).toEqual([200, 'text/javascript; charset=utf-8', 'public, max-age=31536000, immutable'])
    const sw = await call('/sw.js')
    expect([sw.status, sw.headers['cache-control']]).toEqual([200, 'no-cache'])
    expect((await call('/sql-wasm.wasm')).headers['content-type']).toBe('application/wasm')
    const root = await call('/')
    expect([root.status, root.text]).toEqual([200, '<!doctype html><title>shell</title>'])
  })

  it('answers client-side routes with the app shell, and missing files with 404', async () => {
    const route = await call('/train/today')
    expect([route.status, route.headers['content-type'], route.text]).toEqual([200, 'text/html; charset=utf-8', '<!doctype html><title>shell</title>'])
    expect((await call('/assets/missing.js')).status).toBe(404)
  })

  it('never serves a file outside the build folder', async () => {
    const res = await call('/%2e%2e/secret.txt')
    expect(res.status).toBe(404)
    expect(res.text).not.toContain('outside dist')
  })

  it('answers HEAD without a body', async () => {
    const res = await call('/sw.js', { method: 'HEAD' })
    expect([res.status, res.text]).toEqual([200, ''])
  })
})

describe('AI endpoint behind the proxy', () => {
  it('passes the HTTPS and same-origin checks when the proxy says https, and answers the chat', async () => {
    upstream.mockResolvedValueOnce(orOk('Hello'))
    const res = await call('/api/ai/chat', { method: 'POST', headers: proxied, body: chatBody })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.text)).toMatchObject({ ok: true, text: 'Hello', meta: { provider: 'openrouter' } })
    expect(upstream.mock.calls[0][0]).toContain('openrouter.ai')
  })

  it('refuses plain HTTP and other origins', async () => {
    const { 'X-Forwarded-Proto': _, ...plain } = proxied
    const http = await call('/api/ai/chat', { method: 'POST', headers: plain, body: chatBody })
    expect([http.status, JSON.parse(http.text).message]).toEqual([403, 'HTTPS only.'])
    const other = await call('/api/ai/chat', { method: 'POST', headers: { ...proxied, Origin: 'https://evil.example' }, body: chatBody })
    expect(other.status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('runs coach turns in-process through the coach Worker', async () => {
    // The coach Worker's own validation answers, so the turn got past the fitty Worker and into coach/worker.ts.
    const res = await call('/api/ai/coach/turn', { method: 'POST', headers: proxied, body: { v: 1, step: 1, turns: [{ role: 'user', content: 'hi' }] } })
    expect([res.status, JSON.parse(res.text)]).toEqual([400, { ok: false, kind: 'bad_request', message: 'facts are required.' }])
    expect(upstream).not.toHaveBeenCalled()
  })

  it('counts each call in the budget file', async () => {
    upstream.mockResolvedValueOnce(orOk('Hello'))
    await call('/api/ai/chat', { method: 'POST', headers: proxied, body: chatBody })
    const saved = JSON.parse(readFileSync(join(dir, 'data', 'daily-budget.json'), 'utf8'))
    expect(saved.calls).toEqual({ day: new Date().toISOString().slice(0, 10), used: 1 })
  })
})

describe('daily budget', () => {
  const take = (ns: ReturnType<typeof budgetNamespace>) => ns.get(ns.idFromName('calls')).fetch('https://daily-budget/take')

  it('never loses a call when requests overlap, and keeps the count across restarts', async () => {
    const file = join(dir, 'budget.json')
    const shared = budgetNamespace(file)
    const statuses = await Promise.all(Array.from({ length: 5 }, () => take(shared).then((r) => r.status)))
    expect(statuses).toEqual([204, 204, 204, 204, 204])
    expect(JSON.parse(readFileSync(file, 'utf8')).calls.used).toBe(5)
    await take(budgetNamespace(file))
    expect(JSON.parse(readFileSync(file, 'utf8')).calls.used).toBe(6)
  })

  it('refuses once the day is spent', async () => {
    const file = join(dir, 'spent.json')
    writeFileSync(file, JSON.stringify({ calls: { day: new Date().toISOString().slice(0, 10), used: DAILY_CALL_LIMIT } }))
    expect((await take(budgetNamespace(file))).status).toBe(429)
  })
})

describe('env', () => {
  it('passes on only the settings the Workers read', () => {
    const env = hostEnv({ distDir: join(dir, 'dist'), dataDir: join(dir, 'data'), vars: { COACH_BRIDGE_PIN: PIN, HOME: '/root', OPENROUTER_API_KEY: '' } })
    expect(env.COACH_BRIDGE_PIN).toBe(PIN)
    expect('HOME' in env).toBe(false)
    expect('OPENROUTER_API_KEY' in env).toBe(false)
  })
})
