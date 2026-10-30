// Self-hosted server (Coolify on a home server, docs/SELF_HOST.md): the Cloudflare Worker (worker/index.ts) and the
// coach Worker (coach/worker.ts) run unchanged in one Node process.
//
//   phone ──▶ Cloudflare Access ──▶ tunnel ──▶ reverse proxy ──(plain HTTP)──▶ this server ──▶ worker fetch()
//
// What stands in for the Workers bindings:
//   ASSETS        → files from ./dist, index.html for client-side routes (like not_found_handling: single-page-application)
//   COACH         → the coach Worker's fetch, called in-process (it had no public URL on Cloudflare either)
//   DAILY_BUDGET  → the same DailyBudget class, stored in a JSON file in DATA_DIR so a redeploy does not reset the count
//   AI_LIMITER    → not set: there is one process, so the in-memory limits in worker/index.ts already hold
//
// The proxy talks plain HTTP to this container, so the request URL is rebuilt from X-Forwarded-Proto and the Host
// header. Without that the Worker's HTTPS and same-origin checks would refuse every AI call. The port must only be
// reachable through the proxy, which sets those headers.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import coachWorker, { type CoachWorkerEnv } from '../coach/worker'
import worker, { DailyBudget, type Env } from '../worker/index'

/** The settings worker/index.ts and coach/worker.ts read. Everything else in process.env stays out of their env. */
const ENV_KEYS = [
  'COACH_BRIDGE_PIN', 'COACH_PROVIDER', 'OPENROUTER_API_KEY', 'COACH_OPENROUTER_MODEL', 'COACH_OPENROUTER_DATA_COLLECTION',
  'GEMINI_API_KEY', 'COACH_GEMINI_MODEL', 'ANTHROPIC_API_KEY', 'COACH_MODEL', 'COACH_MODEL_ROUTER', 'COACH_SERVICE_TIER', 'OWNER_PROFILE',
] as const

export interface HostOptions {
  /** The built app (vite build output). */
  distDir: string
  /** Where the daily budget file lives. A persistent volume in production. */
  dataDir: string
  /** Usually process.env; only ENV_KEYS are passed on. */
  vars: Record<string, string | undefined>
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
}

/** Static files from distDir. Hashed files under /assets/ are cached for good; everything else (index.html, sw.js, the
 *  manifest) is revalidated, or installed apps would keep an old shell. */
export function assetsFrom(distDir: string): Env['ASSETS'] {
  const root = resolve(distDir)
  const file = async (path: string) => {
    const s = await stat(path).catch(() => null)
    return s?.isFile() ? readFile(path) : null
  }
  return {
    async fetch(request) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
      let pathname: string
      try { pathname = decodeURIComponent(new URL(request.url).pathname) }
      catch { return new Response('Bad request', { status: 400 }) }
      const target = resolve(root, '.' + pathname)
      if (target !== root && !target.startsWith(root + sep)) return new Response('Not found', { status: 404 })
      let path = pathname.endsWith('/') ? join(target, 'index.html') : target
      let body = await file(path)
      // Client-side routes (/train, /coach, ...) have no extension: they get the app shell, like on Cloudflare.
      if (!body && !extname(pathname)) body = await file((path = join(root, 'index.html')))
      if (!body) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      const headers = {
        'Content-Type': TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      }
      return new Response(request.method === 'HEAD' ? null : new Uint8Array(body), { status: 200, headers })
    },
  }
}

/** DailyBudget's storage in one JSON file. Reads come from memory; every write replaces the file atomically. */
export function fileStorage(path: string) {
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown> }
  catch { /* first start or unreadable file: an empty budget */ }
  return {
    async get<T>(key: string): Promise<T | undefined> { return data[key] as T | undefined },
    async put(key: string, value: unknown): Promise<void> {
      data = { ...data, [key]: value }
      writeFileSync(`${path}.tmp`, JSON.stringify(data))
      renameSync(`${path}.tmp`, path)
    },
  }
}

/** One DailyBudget behind the Durable Object namespace shape. Calls are queued, like a Durable Object's input gate,
 *  so two requests can never both read the same count. */
export function budgetNamespace(path: string): NonNullable<Env['DAILY_BUDGET']> {
  const budget = new DailyBudget({ storage: fileStorage(path) })
  let queue: Promise<unknown> = Promise.resolve()
  const take = () => {
    const turn = queue.then(() => budget.fetch())
    queue = turn.catch(() => undefined)
    return turn
  }
  return { idFromName: (name) => name, get: () => ({ fetch: take }) }
}

export function hostEnv({ distDir, dataDir, vars }: HostOptions): Env {
  const settings: Record<string, string> = {}
  for (const key of ENV_KEYS) if (vars[key]) settings[key] = vars[key]
  mkdirSync(dataDir, { recursive: true })
  const coachEnv = settings as CoachWorkerEnv
  return {
    ...settings,
    ASSETS: assetsFrom(distDir),
    COACH: { fetch: (request) => coachWorker.fetch(request, coachEnv) },
    DAILY_BUDGET: budgetNamespace(join(dataDir, 'daily-budget.json')),
  }
}

/** The public URL of a proxied request: scheme from X-Forwarded-Proto (first hop), host from the Host header. */
export function publicUrl(req: IncomingMessage): string {
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https' ? 'https' : 'http'
  return `${proto}://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`
}

function toRequest(req: IncomingMessage): Request {
  const headers = new Headers()
  for (let i = 0; i < req.rawHeaders.length; i += 2) headers.append(req.rawHeaders[i], req.rawHeaders[i + 1])
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(publicUrl(req), {
    method: req.method,
    headers,
    ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}),
  } as RequestInit)
}

async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined)
}

export function createHost(options: HostOptions): Server {
  const env = hostEnv(options)
  // Node keeps running a call after the client goes away, so the Worker's waitUntil has nothing to do here.
  const ctx = { waitUntil: () => undefined }
  return createServer((req, res) => {
    void (async () => {
      try {
        await send(res, await worker.fetch(toRequest(req), env, ctx))
      } catch (e) {
        console.error('host error:', e instanceof Error ? e.name : typeof e)
        if (!res.headersSent) res.statusCode = 500
        res.end()
      }
    })()
  })
}
