// Read-only tools the coach model may call (docs/PRD_COACH_CHAT.md §12). Every number a tool returns is computed
// here, so the model quotes figures and never does its own arithmetic. No tool writes anything: changes still go
// through the PROPOSAL line and Accept/Reject. The summarisers are pure; `runCoachTool` reads the local database.
import { EXERCISES, FOODS } from '../../data'
import type { FoodRecord } from '../../data/foods'
import type { Exercise, NutritionTarget, SleepRecord, WorkoutSession } from '../../domain/types'
import {
  dailyTotalsRange, exerciseHistory, getNutritionTarget, getSessions, getSetsForSession, getSleepRecords,
  type DailyTotal, type ExerciseHistoryEntry,
} from '../../db/repositories'
import { addDays, dateOf, fmtDuration } from '../../lib/util'

/** The tools this app can run. The coach Worker decides which ones each agent is offered (coach/agents.ts). */
export const APP_TOOLS = ['get_sleep', 'get_training', 'get_exercise_history', 'get_nutrition', 'search_library'] as const
type ToolName = (typeof APP_TOOLS)[number]

// --- pure summarisers ----------------------------------------------------------------------------------------

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export function summarizeSleep(records: SleepRecord[], days: number) {
  const nights = records.map((r) => ({ date: dateOf(r.endTs), duration: fmtDuration(r.durationMin), minutes: r.durationMin }))
  const average = avg(records.map((r) => r.durationMin))
  return {
    days,
    nightsLogged: nights.length,
    averageMinutes: average,
    average: average != null ? fmtDuration(average) : null,
    nightsUnder5h30: records.filter((r) => r.durationMin < 330).length,
    nights,
  }
}

export function summarizeNutrition(totals: DailyTotal[], target: NutritionTarget | null, days: number) {
  const logged = totals.filter((d) => d.logged)
  return {
    days,
    daysLogged: logged.length,
    target: target ? { kcal: target.kcal, proteinG: target.proteinG } : null,
    averageOnLoggedDays: { kcal: avg(logged.map((d) => d.kcal)), proteinG: avg(logged.map((d) => d.proteinG)) },
    daysProteinTargetHit: target ? logged.filter((d) => d.proteinG >= target.proteinG).length : null,
    perDay: totals.map((d) => ({ date: d.date, logged: d.logged, kcal: Math.round(d.kcal), proteinG: Math.round(d.proteinG) })),
  }
}

type TopSet = { exercise: string; loadKg: number | null; reps: number | null }

export function summarizeTraining(sessions: WorkoutSession[], topSetsBySession: Record<number, TopSet[]>, days: number) {
  return {
    days,
    planned: sessions.length,
    completed: sessions.filter((s) => s.status === 'completed').length,
    missed: sessions.filter((s) => s.status === 'skipped').length,
    sessions: sessions.map((s) => ({ date: s.scheduledDate, name: s.name, status: s.status, durationMin: s.durationMin, topSets: topSetsBySession[s.id] ?? [] })),
  }
}

/** Heaviest set per exercise (then most reps), by exercise name. */
export function topSets(sets: { exerciseId: string; loadKg: number | null; reps: number | null }[]): TopSet[] {
  const best = new Map<string, TopSet>()
  for (const s of sets) {
    const name = EXERCISES.find((e) => e.id === s.exerciseId)?.name ?? s.exerciseId
    const cur = best.get(name)
    if (!cur || (s.loadKg ?? 0) > (cur.loadKg ?? 0) || ((s.loadKg ?? 0) === (cur.loadKg ?? 0) && (s.reps ?? 0) > (cur.reps ?? 0))) {
      best.set(name, { exercise: name, loadKg: s.loadKg, reps: s.reps })
    }
  }
  return [...best.values()]
}

export function findExercise(name: string, library: Exercise[] = EXERCISES): Exercise | null {
  const q = name.trim().toLowerCase()
  if (!q) return null
  return library.find((e) => e.name.toLowerCase() === q) ?? library.find((e) => e.name.toLowerCase().includes(q)) ?? library.find((e) => q.includes(e.name.toLowerCase())) ?? null
}

export function summarizeExerciseHistory(exercise: Exercise, entries: ExerciseHistoryEntry[]) {
  return {
    exercise: exercise.name,
    sessions: entries.map((e) => {
      const top = [...e.sets].sort((a, b) => (b.loadKg ?? 0) - (a.loadKg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0]
      return { date: e.date, sets: e.sets.length, topSet: top ? { loadKg: top.loadKg, reps: top.reps, rir: top.rir } : null }
    }),
  }
}

/** Keyword scoring over the exercise library and the food list: the simple version of retrieval (RAG). */
export function searchLibrary(query: string, exercises: Exercise[] = EXERCISES, foods: FoodRecord[] = FOODS) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1)
  const score = (text: string) => words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0)
  const hits = [
    ...exercises.map((e) => ({
      score: score(`${e.name} ${e.pattern} ${e.equipment} ${e.primaryMuscles.join(' ')}`.toLowerCase().replace(/_/g, ' ')),
      item: { type: 'exercise', name: e.name, equipment: e.equipment, pattern: e.pattern.replace(/_/g, ' '), muscles: e.primaryMuscles },
    })),
    ...foods.map((f) => {
      const k = f.servingG / 100
      return {
        score: score(`${f.name} ${f.tags.join(' ')}`.toLowerCase()),
        item: { type: 'food', name: f.name, serving: f.servingLabel, perServing: { kcal: Math.round(f.per100g.kcal * k), proteinG: Math.round(f.per100g.proteinG * k) } },
      }
    }),
  ]
  return { query, matches: hits.filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((h) => h.item) }
}

// --- runner ---------------------------------------------------------------------------------------------------

function parseArgs(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

const daysArg = (a: Record<string, unknown>): number | null => (a.days === 7 || a.days === 14 || a.days === 30 ? a.days : null)

/**
 * Runs one tool call against the local database and returns its JSON result. Unknown names (a newer coach asking
 * for a tool this app version doesn't have) and bad arguments return `{ "error": ... }` for the model to read;
 * nothing throws.
 */
export function runCoachTool(name: string, rawArgs: string, today: string): string {
  const out = (v: unknown) => JSON.stringify(v)
  if (!(APP_TOOLS as readonly string[]).includes(name)) return out({ error: `Unknown tool "${name}".` })
  const args = parseArgs(rawArgs)
  if (!args) return out({ error: 'Arguments must be a JSON object.' })
  try {
    switch (name as ToolName) {
      case 'get_sleep': {
        const days = daysArg(args)
        return days ? out(summarizeSleep(getSleepRecords(days), days)) : out({ error: 'days must be 7, 14 or 30.' })
      }
      case 'get_nutrition': {
        const days = daysArg(args)
        return days ? out(summarizeNutrition(dailyTotalsRange(addDays(today, -(days - 1)), today), getNutritionTarget(today), days)) : out({ error: 'days must be 7, 14 or 30.' })
      }
      case 'get_training': {
        const days = daysArg(args)
        if (!days) return out({ error: 'days must be 7, 14 or 30.' })
        const sessions = getSessions(addDays(today, -(days - 1)), today)
        const tops: Record<number, TopSet[]> = {}
        for (const s of sessions) if (s.status === 'completed') tops[s.id] = topSets(getSetsForSession(s.id))
        return out(summarizeTraining(sessions, tops, days))
      }
      case 'get_exercise_history': {
        const name = typeof args.exercise === 'string' ? args.exercise.slice(0, 80) : ''
        const ex = findExercise(name)
        return ex ? out(summarizeExerciseHistory(ex, exerciseHistory(ex.id, 6))) : out({ error: `No exercise called "${name}" in the library.` })
      }
      case 'search_library': {
        const q = typeof args.query === 'string' ? args.query.slice(0, 80) : ''
        return q.trim() ? out(searchLibrary(q)) : out({ error: 'query is required.' })
      }
    }
  } catch (e) {
    console.warn('coach tool failed', name, e)
    return out({ error: 'The data could not be read.' })
  }
  return out({ error: `Unknown tool "${name}".` })
}
