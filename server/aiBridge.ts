// Local AI bridge: lets the app use the owner's Claude subscription through Claude Code on this Mac.
//
//   phone / browser  ──(same-origin /api/ai/*)──▶  Vite dev or preview server  ──▶  `claude -p` (print mode)
//
// Claude Code's non-interactive mode is the supported way to call it programmatically, and it uses the
// login stored on this Mac (run `claude` then `/login` once). Nothing here holds an API key.
//
// Safety posture (this server is reachable on the home network because Vite runs with --host):
//   - same-origin requests only, private-network clients only, optional PIN (COACH_BRIDGE_PIN)
//   - the model gets NO tools, except `Read` when files are attached, scoped to a throw-away temp dir
//   - no MCP servers, no project settings, no session persistence, hard timeout, small concurrency cap
//
// Structured calls pass the schema with `--json-schema`: Claude Code validates the reply and returns it as
// `structured_output`. When that field is missing (older CLI, or COACH_BRIDGE_SCHEMA=prompt) the schema goes into the
// prompt instead and the JSON is pulled out of the text reply.
//
// Env: COACH_CLAUDE_BIN (default "claude"), COACH_CLAUDE_MODEL (default "sonnet"), COACH_CLAUDE_EFFORT (structured calls
//      only; default "low", "default" leaves it to Claude Code), COACH_BRIDGE_SCHEMA=prompt, COACH_BRIDGE_PIN,
//      COACH_BRIDGE_DISABLED=1 to turn the bridge off.

import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const BIN = process.env.COACH_CLAUDE_BIN || 'claude'
const DEFAULT_MODEL = process.env.COACH_CLAUDE_MODEL || 'sonnet'
const PIN = process.env.COACH_BRIDGE_PIN || ''
const MAX_BODY_BYTES = 40 * 1024 * 1024
const CALL_TIMEOUT_MS = 150_000
const MAX_CONCURRENT = 2
const ALLOWED_MODELS = new Set(['sonnet', 'opus', 'haiku', 'fable', 'default'])
const ALLOWED_EFFORT = new Set(['low', 'medium', 'high', 'xhigh', 'max'])
// Structured calls are transcription, routing and short drafts. Measured on the workout planner with sonnet:
// 89 s at Claude Code's default effort, 26-35 s at low, with the same valid plan.
const JSON_EFFORT = process.env.COACH_CLAUDE_EFFORT ?? 'low'
const DIR_PREFIX = 'coach-ai-'
const CONNECTED = 'Connected to Claude through Claude Code on this Mac.'

// Optional CLI flags are switched off for the rest of the process when the installed Claude Code rejects them.
let schemaFlag = process.env.COACH_BRIDGE_SCHEMA !== 'prompt'
const noEffort = new Set<string>()

type BridgeErrorKind = 'not_installed' | 'auth' | 'timeout' | 'bad_request' | 'forbidden' | 'busy' | 'failed'

class BridgeError extends Error {
  constructor(readonly kind: BridgeErrorKind, message: string, readonly status = 500) {
    super(message)
  }
}

interface Attachment { base64: string; mediaType: string; name?: string }
interface RunOptions { system: string; prompt: string; attachments?: Attachment[]; schema?: unknown; model?: string }
interface CliResult { text: string; structured: unknown; costUsd: number | null; model: string | null }
interface RunResult extends CliResult { durationMs: number }

// --- environment -----------------------------------------------------------------------------------

/** The dev server may itself be started from a Claude session; never leak that session's variables into the child. */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(CLAUDE|ANTHROPIC_)/.test(k)) continue
    env[k] = v
  }
  return env
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf', 'text/plain': 'txt',
}

let active = 0

function runClaude(args: string[], stdin: string, cwd: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(BIN, args, { cwd, env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      reject(new BridgeError('not_installed', `Could not start "${BIN}": ${(e as Error).message}`, 503))
      return
    }
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new BridgeError('timeout', 'Claude took too long to answer. Try again.', 504))
    }, CALL_TIMEOUT_MS)
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8') })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8') })
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      reject(e.code === 'ENOENT'
        ? new BridgeError('not_installed', 'Claude Code is not installed on this Mac (command "claude" not found).', 503)
        : new BridgeError('failed', e.message))
    })
    child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, code }) })
    // A child that dies before reading its prompt (not installed, bad flag) must not take the dev server down with EPIPE.
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
  })
}

const AUTH_HINT = 'Claude Code on this Mac is signed out. Open Terminal, run `claude`, type /login and sign in with your Claude subscription, then try again.'

async function ask(opts: RunOptions): Promise<RunResult> {
  if (active >= MAX_CONCURRENT) throw new BridgeError('busy', 'The AI bridge is busy. Try again in a moment.', 429)
  active++
  const dir = await mkdtemp(join(tmpdir(), 'coach-ai-'))
  try {
    const files: string[] = []
    for (const [i, a] of (opts.attachments ?? []).entries()) {
      const ext = EXT[a.mediaType]
      if (!ext) throw new BridgeError('bad_request', `Unsupported attachment type: ${a.mediaType}`, 400)
      const name = `input-${i + 1}.${ext}`
      await writeFile(join(dir, name), Buffer.from(a.base64, 'base64'))
      files.push(name)
    }

    let prompt = opts.prompt
    if (files.length) {
      prompt += `\n\nAttached file${files.length > 1 ? 's' : ''} (in the current directory): ${files.map((f) => `./${f}`).join(', ')}. Open ${files.length > 1 ? 'each one' : 'it'} with the Read tool before answering.`
    }
    if (opts.schema) {
      prompt += `\n\nRespond with ONLY one JSON object that validates against this JSON Schema. No prose, no code fences.\n${JSON.stringify(opts.schema)}`
    }

    const model = opts.model && ALLOWED_MODELS.has(opts.model) ? opts.model : DEFAULT_MODEL
    const args = [
      '-p',
      '--output-format', 'json',
      '--system-prompt', opts.system,
      '--tools', files.length ? 'Read' : '',
      '--max-turns', String(files.length ? 3 + files.length * 2 : 1),
      '--strict-mcp-config',
      '--setting-sources', 'project',
      '--no-session-persistence',
    ]
    if (files.length) args.push('--allowedTools', 'Read')
    if (model !== 'default') args.push('--model', model)

    const started = Date.now()
    const { stdout, stderr, code } = await runClaude(args, prompt, dir)

    let parsed: Record<string, unknown> | null = null
    try { parsed = JSON.parse(stdout) as Record<string, unknown> } catch { /* handled below */ }
    const text = typeof parsed?.result === 'string' ? parsed.result : ''
    if (/failed to authenticate|oauth|invalid api key|please run \/login|not logged in/i.test(text || stderr || stdout)) {
      if (!parsed || parsed.is_error) throw new BridgeError('auth', AUTH_HINT, 401)
    }
    if (!parsed) throw new BridgeError('failed', (stderr || stdout || `claude exited with code ${code}`).slice(0, 400))
    if (parsed.is_error) throw new BridgeError('failed', text.slice(0, 400) || 'Claude returned an error.')

    const usage = parsed.modelUsage && typeof parsed.modelUsage === 'object' ? Object.keys(parsed.modelUsage as object) : []
    return {
      text,
      structured: parsed.structured_output ?? null,
      durationMs: Date.now() - started,
      costUsd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null,
      model: usage[0] ?? null,
    }
  } finally {
    active--
    void rm(dir, { recursive: true, force: true })
  }
}

// --- JSON extraction ----------------------------------------------------------------------------------

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try { return JSON.parse(cleaned) } catch { /* try the outermost braces */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
  throw new Error('no JSON object in reply')
}

// --- health ------------------------------------------------------------------------------------------------

interface Health { ok: boolean; installed: boolean; version: string | null; auth: 'ok' | 'signed_out' | 'unknown'; message: string; model: string; checkedAt: number }
let health: Health | null = null

async function checkInstalled(): Promise<{ installed: boolean; version: string | null }> {
  try {
    const { stdout, code } = await runClaude(['--version'], '', tmpdir())
    return { installed: code === 0, version: stdout.trim().split('\n')[0] || null }
  } catch {
    return { installed: false, version: null }
  }
}

async function getHealth(deep: boolean): Promise<Health> {
  const fresh = health && Date.now() - health.checkedAt < 10 * 60_000
  if (health && fresh && (!deep || health.auth !== 'unknown')) return health
  const { installed, version } = await checkInstalled()
  let auth: Health['auth'] = 'unknown'
  let message = installed ? 'Claude Code found on this Mac.' : 'Claude Code is not installed on this Mac.'
  if (installed && deep) {
    try {
      await ask({ system: 'You are a connectivity check. Reply with the single word OK.', prompt: 'OK?', model: 'haiku' })
      auth = 'ok'
      message = 'Connected to Claude through Claude Code on this Mac.'
    } catch (e) {
      if (e instanceof BridgeError && e.kind === 'auth') { auth = 'signed_out'; message = AUTH_HINT }
      else message = e instanceof Error ? e.message : 'Claude Code did not respond.'
    }
  }
  health = { ok: installed && auth === 'ok', installed, version, auth, message, model: DEFAULT_MODEL, checkedAt: Date.now() }
  return health
}

// --- HTTP plumbing --------------------------------------------------------------------------------------

function isPrivateAddress(addr: string | undefined): boolean {
  if (!addr) return false
  const a = addr.replace(/^::ffff:/, '')
  return a === '127.0.0.1' || a === '::1' || /^10\./.test(a) || /^192\.168\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a) || /^169\.254\./.test(a) || /^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a)
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY_BYTES) { reject(new BridgeError('bad_request', 'Request too large.', 413)); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>) }
      catch { reject(new BridgeError('bad_request', 'Body must be JSON.', 400)) }
    })
    req.on('error', reject)
  })
}

function guard(req: IncomingMessage): void {
  if (!isPrivateAddress(req.socket.remoteAddress)) throw new BridgeError('forbidden', 'The AI bridge only answers devices on your own network.', 403)
  const origin = req.headers.origin
  if (origin) {
    let host = ''
    try { host = new URL(origin).host } catch { /* malformed origin */ }
    // HTTP/2 (the HTTPS dev server) carries the hostname in :authority instead of Host.
    const authority = req.headers[':authority']
    const self = req.headers.host ?? (Array.isArray(authority) ? authority[0] : authority)
    if (host !== self) throw new BridgeError('forbidden', 'Cross-origin requests are not allowed.', 403)
  }
  if (PIN && req.headers['x-coach-pin'] !== PIN) throw new BridgeError('forbidden', 'Bridge PIN required. Enter it in Settings → AI.', 403)
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

async function handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  try {
    guard(req)
    if (path === '/health' && req.method === 'GET') {
      const deep = (req.url ?? '').includes('deep=1')
      send(res, 200, { ...(await getHealth(deep)), pinRequired: !!PIN })
      return
    }
    if (req.method !== 'POST') throw new BridgeError('bad_request', 'POST only.', 405)
    const body = await readBody(req)
    const system = str(body.system).slice(0, 40_000)
    const model = str(body.model) || undefined
    const attachments = Array.isArray(body.attachments) ? (body.attachments as Attachment[]).slice(0, 4) : []

    if (path === '/chat') {
      const turns = Array.isArray(body.turns) ? (body.turns as { role: string; content: string }[]) : []
      if (!turns.length) throw new BridgeError('bad_request', 'turns[] is required.', 400)
      const last = turns[turns.length - 1]
      const history = turns.slice(0, -1).map((t) => `${t.role === 'assistant' ? 'Coach' : 'User'}: ${t.content}`).join('\n\n')
      const prompt = history ? `Conversation so far:\n${history}\n\nUser: ${last.content}\n\nReply as the coach to the last user message only.` : last.content
      const r = await ask({ system, prompt, attachments, model })
      if (health) health = { ...health, ok: true, auth: 'ok', checkedAt: Date.now() }
      send(res, 200, { ok: true, text: r.text, meta: { durationMs: r.durationMs, costUsd: r.costUsd, model: r.model } })
      return
    }

    if (path === '/json') {
      const prompt = str(body.prompt)
      if (!prompt || !body.schema) throw new BridgeError('bad_request', 'prompt and schema are required.', 400)
      const r = await ask({ system, prompt, attachments, schema: body.schema, model })
      let data: unknown
      try { data = r.structured ?? extractJson(r.text) }
      catch { throw new BridgeError('failed', 'Claude did not return valid JSON. Try again.', 502) }
      if (health) health = { ...health, ok: true, auth: 'ok', checkedAt: Date.now() }
      send(res, 200, { ok: true, data, meta: { durationMs: r.durationMs, costUsd: r.costUsd, model: r.model } })
      return
    }

    throw new BridgeError('bad_request', 'Unknown endpoint.', 404)
  } catch (e) {
    if (e instanceof BridgeError) {
      if (e.kind === 'auth' && health) health = { ...health, ok: false, auth: 'signed_out', message: AUTH_HINT, checkedAt: Date.now() }
      send(res, e.status, { ok: false, kind: e.kind, message: e.message })
    } else {
      send(res, 500, { ok: false, kind: 'failed', message: e instanceof Error ? e.message : 'Bridge error.' })
    }
  }
}

type Middlewares = { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }

function mount(middlewares: Middlewares): void {
  middlewares.use((req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith('/api/ai/')) { next(); return }
    const path = url.slice('/api/ai'.length).split('?')[0]
    void handle(req, res, path)
  })
}

export function aiBridge(): Plugin {
  const disabled = process.env.COACH_BRIDGE_DISABLED === '1'
  return {
    name: 'coach-ai-bridge',
    configureServer(server) { if (!disabled) mount(server.middlewares) },
    configurePreviewServer(server) { if (!disabled) mount(server.middlewares) },
  }
}
