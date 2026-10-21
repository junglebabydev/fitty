// Shared by the evals: where their data lives (.evals/, git-ignored) and the API keys, read from the environment or
// from .evals/.env (one KEY=value per line). Run the evals from the repo root.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const EVALS_DIR = join(process.cwd(), '.evals')

export function evalDir(...parts: string[]): string {
  const dir = join(EVALS_DIR, ...parts)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function evalKey(name: 'OPENROUTER_API_KEY' | 'GEMINI_API_KEY'): string {
  const fromEnv = process.env[name]?.trim()
  if (fromEnv) return fromEnv
  const file = join(EVALS_DIR, '.env')
  if (!existsSync(file)) return ''
  const line = readFileSync(file, 'utf8').split('\n').find((l) => l.trim().startsWith(`${name}=`))
  return line ? line.trim().slice(name.length + 1).trim().replace(/^["']|["']$/g, '') : ''
}

/** "2026-10-15T03-40" for result file names. */
export const stamp = () => new Date().toISOString().slice(0, 16).replace(':', '-')

export function median(xs: number[]): number {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Runs `fn` over `items`, `n` at a time, keeping order. */
export async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i) }
  }))
  return out
}
