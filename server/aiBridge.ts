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
// Structured calls (/json) have two ways to get JSON back:
//   flag   — `--json-schema`: Claude Code validates the reply against the schema and returns it as `structured_output`.
//            It costs one extra turn (the tool call, then a one-word close).
//   prompt — the schema goes into the prompt and the JSON object is pulled out of the text reply.
// COACH_BRIDGE_SCHEMA picks one; the default "auto" uses the flag for text-only calls and the prompt for calls with
// attachments, where the extra turn was measured at +14 s (lab report, sonnet: 10.8 s prompt vs 24-27 s flag). Whatever
// the mode, a reply without `structured_output` falls back to text extraction, and a CLI too old for the flag falls
// back to the prompt.
//
// Env: COACH_CLAUDE_BIN (default "claude"), COACH_CLAUDE_MODEL (default "sonnet"), COACH_CLAUDE_EFFORT (/json calls only;
//      default "low", "default" leaves it to Claude Code), COACH_BRIDGE_SCHEMA (auto | flag | prompt), COACH_BRIDGE_PIN,
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
// 89 s at Claude Code's default effort, 24-35 s at low, with an equally valid plan.
const JSON_EFFORT = process.env.COACH_CLAUDE_EFFORT ?? 'low'
const DIR_PREFIX = 'coach-ai-'
const CONNECTED = 'Connected to Claude through Claude Code on this Mac.'

// Optional CLI flags are switched off for the rest of the process when the installed Claude Code rejects them.
const SCHEMA_MODE = process.env.COACH_BRIDGE_SCHEMA === 'flag' || process.env.COACH_BRIDGE_SCHEMA === 'prompt' ? process.env.COACH_BRIDGE_SCHEMA : 'auto'
let schemaFlag = SCHEMA_MODE !== 'prompt'
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

const STRUCTURED_RULE =
  'OUTPUT: return the result by calling the StructuredOutput tool exactly once. Wherever these instructions ask for JSON, that JSON object is the tool input. ' +
  'After the tool call, reply with the single word DONE: no summary, no markdown, no emoji.'

/**
 * Claude Code also makes small housekeeping calls (on Haiku), and `modelUsage` lists those first:
 * the model that answered is the one that wrote the most output.
 */
export function mainModel(modelUsage: unknown): string | null {
  if (!modelUsage || typeof modelUsage !== 'object') return null
  let best: string | null = null
  let most = -1
  for (const [name, usage] of Object.entries(modelUsage as Record<string, { outputTokens?: unknown } | null>)) {
    const out = typeof usage?.outputTokens === 'number' ? usage.outputTokens : 0
    if (out > most) { best = name; most = out }
  }
  return best
}

/** Reads the `--output-format json` result. Throws a BridgeError for sign-in problems, CLI errors and unreadable output. */
export function readCliResult(stdout: string, stderr: string, code: number | null): CliResult {
  let parsed: Record<string, unknown> | null = null
  try {
    const j: unknown = JSON.parse(stdout)
    if (j && typeof j === 'object' && !Array.isArray(j)) parsed = j as Record<string, unknown>
  } catch { /* handled below */ }
  const text = typeof parsed?.result === 'string' ? parsed.result : ''
  if (/failed to authenticate|oauth|invalid api key|please run \/login|not logged in/i.test(text || stderr || stdout)) {
    if (!parsed || parsed.is_error) throw new BridgeError('auth', AUTH_HINT, 401)
  }
  if (!parsed) throw new BridgeError('failed', (stderr || stdout || `claude exited with code ${code}`).slice(0, 400))
  const structured = parsed.structured_output && typeof parsed.structured_output === 'object' ? parsed.structured_output : null
  // A run that ran out of turns after delivering its structured output still has a usable answer.
  if (parsed.is_error && !structured) {
    throw new BridgeError('failed', text.slice(0, 400) || `Claude stopped early${typeof parsed.subtype === 'string' ? ` (${parsed.subtype})` : ''}. Try again.`)
  }
  return { text, structured, costUsd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : null, model: mainModel(parsed.modelUsage) }
}

// Attachments (meal photos, lab reports) live in a throw-away directory per call. Three layers make sure none is left
// behind: the awaited removal below, a synchronous sweep when the server process exits, and a sweep of stale
// directories (a crash, a force-quit) when the bridge is mounted. The set is process-wide because Vite re-imports
// this module on every config restart.
const shared = globalThis as typeof globalThis & { __coachAiDirs?: Set<string> }
const liveDirs: Set<string> = shared.__coachAiDirs ?? new Set<string>()
if (!shared.__coachAiDirs) {
  shared.__coachAiDirs = liveDirs
  process.once('exit', () => { for (const d of liveDirs) { try { rmSync(d, { recursive: true, force: true }) } catch { /* best effort */ } } })
}

async function sweepStaleDirs(): Promise<void> {
  try {
    const root = tmpdir()
    for (const name of await readdir(root)) {
      if (!name.startsWith(DIR_PREFIX)) continue
      const path = join(root, name)
      const info = await stat(path).catch(() => null)
      if (info && !liveDirs.has(path) && Date.now() - info.mtimeMs > CALL_TIMEOUT_MS * 2) await rm(path, { recursive: true, force: true }).catch(() => {})
    }
  } catch { /* best effort */ }
}

async function ask(opts: RunOptions): Promise<RunResult> {
  if (active >= MAX_CONCURRENT) throw new BridgeError('busy', 'The AI bridge is busy. Try again in a moment.', 429)
  active++
  let dir: string | null = null
  try {
    dir = await mkdtemp(join(tmpdir(), DIR_PREFIX))
    liveDirs.add(dir)
    const files: string[] = []
    for (const [i, a] of (opts.attachments ?? []).entries()) {
      const ext = a && typeof a.mediaType === 'string' ? EXT[a.mediaType] : undefined
      if (!ext) throw new BridgeError('bad_request', `Unsupported attachment type: ${String(a?.mediaType)}`, 400)
      if (typeof a.base64 !== 'string' || !a.base64) throw new BridgeError('bad_request', 'Attachment has no data.', 400)
      const name = `input-${i + 1}.${ext}`
      await writeFile(join(dir, name), Buffer.from(a.base64.replace(/^data:[^,]*,/, ''), 'base64'))
      files.push(name)
    }
    const attached = files.length
      ? `\n\nAttached file${files.length > 1 ? 's' : ''} (in the current directory): ${files.map((f) => `./${f}`).join(', ')}. Open ${files.length > 1 ? 'each one' : 'it'} with the Read tool before answering.`
      : ''
    const model = opts.model && ALLOWED_MODELS.has(opts.model) ? opts.model : DEFAULT_MODEL
    const started = Date.now()

    // At most two retries: one per optional flag (see `rejected` below).
    for (let attempt = 0; ; attempt++) {
      const structuredCall = !!opts.schema && schemaFlag && (SCHEMA_MODE === 'flag' || files.length === 0)
      const effort = opts.schema && ALLOWED_EFFORT.has(JSON_EFFORT) && !noEffort.has(model) ? JSON_EFFORT : ''
      const prompt = opts.prompt + attached + (opts.schema && !structuredCall
        ? `\n\nRespond with ONLY one JSON object that validates against this JSON Schema. No prose, no code fences.\n${JSON.stringify(opts.schema)}`
        : '')
      // Turns: one per attached file to read it (plus slack), one to answer; a structured call adds the tool call,
      // its one-word close and room for one validation retry.
      const turns = (files.length ? 3 + files.length * 2 : 1) + (structuredCall ? 3 : 0)
      const args = [
        '-p',
        '--output-format', 'json',
        '--system-prompt', structuredCall ? `${opts.system}\n\n${STRUCTURED_RULE}` : opts.system,
        '--tools', files.length ? 'Read' : '',
        '--max-turns', String(turns),
        '--strict-mcp-config',
        '--setting-sources', 'project',
        '--no-session-persistence',
      ]
      if (files.length) args.push('--allowedTools', 'Read')
      if (model !== 'default') args.push('--model', model)
      if (effort) args.push('--effort', effort)
      if (structuredCall) args.push('--json-schema', JSON.stringify(opts.schema))

      const { stdout, stderr, code } = await runClaude(args, prompt, dir)
      // An older Claude Code does not know --json-schema or --effort, and a model may refuse the effort level:
      // drop the flag for the rest of the process and ask again. Such failures are immediate, so the retry is cheap.
      const rejected = attempt < 2 && code !== 0 ? /unknown option '?--(json-schema|effort)|(effort)/i.exec(`${stderr}\n${stdout}`.slice(0, 4000)) : null
      if (rejected && structuredCall && rejected[1] === 'json-schema') { schemaFlag = false; continue }
      if (rejected && effort) { noEffort.add(model); continue }
      return { ...readCliResult(stdout, stderr, code), durationMs: Date.now() - started }
    }
  } finally {
    active--
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {})
      liveDirs.delete(dir)
    }
  }
}

// --- JSON extraction ----------------------------------------------------------------------------------

/** The JSON object in a text reply (code fences and surrounding prose tolerated). Throws when there is none: `null`, arrays and bare values are not answers. */
export function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  try {
    const whole: unknown = JSON.parse(cleaned)
    if (isObject(whole)) return whole
  } catch { /* try the outermost braces */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const inner: unknown = JSON.parse(cleaned.slice(start, end + 1))
    if (isObject(inner)) return inner
  }
  throw new Error('no JSON object in reply')
}

// --- health ------------------------------------------------------------------------------------------------

interface Health { ok: boolean; installed: boolean; version: string | null; auth: 'ok' | 'signed_out' | 'unknown'; message: string; model: string; host: 'mac'; checkedAt: number }
let health: Health | null = null
/** True when `health` came from a real model call (a deep check or a user call), not just from finding the binary. */
let proven = false
let deepCheck: Promise<Health> | null = null
const HEALTHY_TTL_MS = 10 * 60_000
const UNHEALTHY_TTL_MS = 30_000

async function checkInstalled(): Promise<{ installed: boolean; version: string | null }> {
  try {
    const { stdout, code } = await runClaude(['--version'], '', tmpdir())
    return { installed: code === 0, version: stdout.trim().split('\n')[0] || null }
  } catch {
    return { installed: false, version: null }
  }
}

/** Only a real, non-empty answer from the model may mark the bridge healthy. */
function markHealthy(): void {
  if (!health) return
  health = { ...health, ok: true, installed: true, auth: 'ok', message: CONNECTED, checkedAt: Date.now() }
  proven = true
}

async function runHealthCheck(deep: boolean): Promise<Health> {
  const { installed, version } = await checkInstalled()
  let auth: Health['auth'] = 'unknown'
  let message = installed ? 'Claude Code found on this Mac.' : 'Claude Code is not installed on this Mac.'
  if (installed && deep) {
    try {
      const r = await ask({ system: 'You are a connectivity check. Reply with the single word OK.', prompt: 'OK?', model: 'haiku' })
      if (r.text.trim()) { auth = 'ok'; message = CONNECTED }
      else message = 'Claude Code answered with an empty reply. Try again.'
    } catch (e) {
      // Both slots taken by real calls says nothing about sign-in: keep what those calls last proved.
      if (e instanceof BridgeError && e.kind === 'busy' && health) return health
      if (e instanceof BridgeError && e.kind === 'auth') { auth = 'signed_out'; message = AUTH_HINT }
      else message = e instanceof Error ? e.message : 'Claude Code did not respond.'
    }
  }
  health = { ok: installed && auth === 'ok', installed, version, auth, message, model: DEFAULT_MODEL, host: 'mac', checkedAt: Date.now() }
  proven = deep
  return health
}

/**
 * A healthy result is reused for ten minutes. A failed deep check is reused for 30 s only, so signing in (or a
 * transient failure clearing) shows up on the next "check again"; a result that only proves the binary exists
 * never answers a deep check.
 */
async function getHealth(deep: boolean): Promise<Health> {
  const age = health ? Date.now() - health.checkedAt : Infinity
  const ttl = health?.ok || !deep ? HEALTHY_TTL_MS : UNHEALTHY_TTL_MS
  if (health && age < ttl && (!deep || proven)) return health
  if (!deep) return runHealthCheck(false)
  // Several tabs or devices opening at once share one check instead of taking both call slots.
  deepCheck ??= runHealthCheck(true).finally(() => { deepCheck = null })
  return deepCheck
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
      if (!r.text.trim()) throw new BridgeError('failed', 'Claude returned an empty reply. Try again.', 502)
      markHealthy()
      send(res, 200, { ok: true, text: r.text, meta: { durationMs: r.durationMs, costUsd: r.costUsd, model: r.model } })
      return
    }

    if (path === '/json') {
      const prompt = str(body.prompt)
      if (!prompt || !body.schema || typeof body.schema !== 'object') throw new BridgeError('bad_request', 'prompt and schema are required.', 400)
      const r = await ask({ system, prompt, attachments, schema: body.schema, model })
      let data: unknown
      try { data = r.structured ?? extractJson(r.text) }
      catch { throw new BridgeError('failed', 'Claude did not return valid JSON. Try again.', 502) }
      markHealthy()
      send(res, 200, { ok: true, data, meta: { durationMs: r.durationMs, costUsd: r.costUsd, model: r.model, structured: r.structured != null } })
      return
    }

    throw new BridgeError('bad_request', 'Unknown endpoint.', 404)
  } catch (e) {
    if (e instanceof BridgeError) {
      if (e.kind === 'auth' && health) { health = { ...health, ok: false, auth: 'signed_out', message: AUTH_HINT, checkedAt: Date.now() }; proven = true }
      send(res, e.status, { ok: false, kind: e.kind, message: e.message })
    } else {
      send(res, 500, { ok: false, kind: 'failed', message: e instanceof Error ? e.message : 'Bridge error.' })
    }
  }
}

type Middlewares = { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void }

function mount(middlewares: Middlewares): void {
  void sweepStaleDirs()
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
