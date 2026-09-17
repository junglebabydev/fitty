// Pure row -> domain mapping helpers plus date-window helpers.
// No database access here so everything in this file is unit-testable without sql.js.
// SQLite columns are snake_case; booleans are stored as 0/1; JSON blobs live in *_json TEXT columns.
import type { SqlValue } from '../database'
import type {
  BodyMetric, CardioSession, CoachDecision, CoachMessage, ConditionFlag, DailyCheckIn, Evidence, Exercise,
  ExerciseSet, FoodItem, Goal, HealthMetric, HealthReport, JournalEntry, LedgerEntry, Macros, Meal, MindSession, MobilitySession, MoodLog, NutritionTarget,
  PlannedExercise, ProgressPhoto, ProposedAction, Readiness, Region, RedFlags, ReportMarker, SafetyTag, SleepRecord,
  SymptomCheck, Units, UserProfile, VoiceCommandRecord, WorkoutSession,
} from '../../domain/types'
import { addDays, daysBetween, isoAt, todayStr } from '../../lib/util'

// --- primitive helpers -------------------------------------------------------

/** 0/1 (or '0'/'1') INTEGER column -> boolean. */
export function bool(v: SqlValue | undefined): boolean {
  return v === 1 || v === '1'
}

/** Parse a *_json TEXT column; returns `fallback` on NULL, empty, invalid JSON or JSON null. */
export function parseJson<T>(s: SqlValue | undefined, fallback: T): T {
  if (typeof s !== 'string' || s === '') return fallback
  try {
    const v: unknown = JSON.parse(s)
    return v === null || v === undefined ? fallback : (v as T)
  } catch {
    return fallback
  }
}

/** Domain value -> bindable SQL value: booleans to 0/1, objects/arrays to JSON, undefined to NULL. */
export function toSql(v: unknown): SqlValue {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number' || typeof v === 'string') return v
  if (v instanceof Uint8Array) return v
  return JSON.stringify(v)
}

/** "?, ?, ?" for IN (...) lists. */
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => '?').join(', ')
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// --- date windows ------------------------------------------------------------
// Timestamps are UTC ISO strings (nowIso()/isoAt()), so lexicographic comparison in SQL is chronological.

/** [start, end) ISO bounds covering one local calendar date. */
export function dayRange(date: string): [string, string] {
  return [isoAt(date, 0), isoAt(addDays(date, 1), 0)]
}

/** ISO local-midnight `days - 1` days before `today`, so `days = 7` spans today plus the six previous days. */
export function sinceIso(days: number, today: string = todayStr()): string {
  const n = Math.max(1, Math.floor(days))
  return isoAt(addDays(today, -(n - 1)), 0)
}

// --- daily totals ------------------------------------------------------------

export interface DailyTotalRow { date: string; kcal: number; proteinG: number }
export interface DailyTotal { date: string; kcal: number; proteinG: number; logged: boolean }

/**
 * One entry per calendar date in [from, to] inclusive. `rows` may contain several entries per date
 * (one per meal); they are summed. Dates with no rows get zeros and logged = false.
 * Returns [] when from > to.
 */
export function fillDates(from: string, to: string, rows: DailyTotalRow[]): DailyTotal[] {
  const byDate = new Map<string, { kcal: number; proteinG: number }>()
  for (const r of rows) {
    const cur = byDate.get(r.date)
    if (cur) { cur.kcal += r.kcal; cur.proteinG += r.proteinG }
    else byDate.set(r.date, { kcal: r.kcal, proteinG: r.proteinG })
  }
  const n = daysBetween(from, to)
  const out: DailyTotal[] = []
  for (let i = 0; i <= n; i++) {
    const date = addDays(from, i)
    const t = byDate.get(date)
    out.push(t
      ? { date, kcal: round1(t.kcal), proteinG: round1(t.proteinG), logged: true }
      : { date, kcal: 0, proteinG: 0, logged: false })
  }
  return out
}

// --- row types + mappers -----------------------------------------------------

export interface ProfileRow {
  id: number; name: string; dob: string; sex: string; height_cm: number; units: string; experience: string
  diet_pattern: string; equipment_json: string; mobility_priorities_json: string; coach_style: string
  training_days_min: number; training_days_target: number; training_days_stretch: number; onboarded: number; created_at: string
}
export function mapProfile(r: ProfileRow): UserProfile {
  return {
    name: r.name,
    dob: r.dob,
    sex: r.sex as UserProfile['sex'],
    heightCm: r.height_cm,
    units: r.units as Units,
    experience: r.experience as UserProfile['experience'],
    dietPattern: r.diet_pattern,
    equipment: parseJson<string[]>(r.equipment_json, []),
    mobilityPriorities: parseJson<string[]>(r.mobility_priorities_json, []),
    coachStyle: r.coach_style as UserProfile['coachStyle'],
    trainingDaysMin: r.training_days_min,
    trainingDaysTarget: r.training_days_target,
    trainingDaysStretch: r.training_days_stretch,
    onboarded: bool(r.onboarded),
  }
}

export interface GoalRow {
  id: number; type: string; target_value: number; unit: string; priority: number
  start_date: string; target_date: string | null; status: string
}
export function mapGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    type: r.type as Goal['type'],
    targetValue: r.target_value,
    unit: r.unit,
    priority: r.priority,
    startDate: r.start_date,
    targetDate: r.target_date ?? null,
    status: r.status as Goal['status'],
  }
}

export interface ConditionFlagRow { id: number; region: string; label: string; baseline_notes: string; created_at: string }
export function mapConditionFlag(r: ConditionFlagRow): ConditionFlag {
  return { id: r.id, region: r.region as Region, label: r.label, baselineNotes: r.baseline_notes ?? '' }
}

export interface SymptomRow {
  id: number; ts: string; region: string; pain_score: number; red_flags_json: string
  notes: string; context: string; session_id: number | null; exercise_id?: string | null
}
export function mapSymptom(r: SymptomRow): SymptomCheck {
  return {
    id: r.id,
    ts: r.ts,
    region: r.region as Region,
    painScore: r.pain_score,
    redFlags: parseJson<RedFlags>(r.red_flags_json, {}),
    notes: r.notes ?? '',
    context: r.context as SymptomCheck['context'],
    sessionId: r.session_id ?? null,
    exerciseId: r.exercise_id ?? null,
  }
}

export interface ExerciseRow {
  id: string; name: string; equipment: string; primary_muscles_json: string; secondary_muscles_json: string
  pattern: string; safety_tags_json: string; substitutions_json: string; instructions: string; timed: number
}
export function mapExercise(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    equipment: r.equipment,
    primaryMuscles: parseJson<string[]>(r.primary_muscles_json, []),
    secondaryMuscles: parseJson<string[]>(r.secondary_muscles_json, []),
    pattern: r.pattern,
    safetyTags: parseJson<SafetyTag[]>(r.safety_tags_json, []),
    substitutions: parseJson<string[]>(r.substitutions_json, []),
    instructions: r.instructions ?? '',
    timed: bool(r.timed),
  }
}

export interface SessionRow {
  id: number; template_key: string; name: string; type: string; tier: string; scheduled_date: string; status: string
  started_at: string | null; completed_at: string | null; duration_min: number | null; readiness: string | null
  session_rpe: number | null; notes: string; exercises_json: string
}
export function mapSession(r: SessionRow): WorkoutSession {
  return {
    id: r.id,
    templateKey: r.template_key,
    name: r.name,
    type: r.type as WorkoutSession['type'],
    tier: r.tier as WorkoutSession['tier'],
    scheduledDate: r.scheduled_date,
    status: r.status as WorkoutSession['status'],
    startedAt: r.started_at ?? null,
    completedAt: r.completed_at ?? null,
    durationMin: r.duration_min ?? null,
    readiness: (r.readiness as Readiness | null) ?? null,
    sessionRpe: r.session_rpe ?? null,
    notes: r.notes ?? '',
    exercises: parseJson<PlannedExercise[]>(r.exercises_json, []),
  }
}

export interface SetRow {
  id: number; session_id: number; exercise_id: string; set_index: number; reps: number | null; load_kg: number | null
  rir: number | null; rpe: number | null; duration_sec: number | null; pain_flag: number; logged_at: string
}
export function mapSet(r: SetRow): ExerciseSet {
  return {
    id: r.id,
    sessionId: r.session_id,
    exerciseId: r.exercise_id,
    setIndex: r.set_index,
    reps: r.reps ?? null,
    loadKg: r.load_kg ?? null,
    rir: r.rir ?? null,
    rpe: r.rpe ?? null,
    durationSec: r.duration_sec ?? null,
    painFlag: bool(r.pain_flag),
    loggedAt: r.logged_at,
  }
}

export interface CardioRow {
  id: number; session_id: number | null; modality: string; duration_min: number; distance_km: number | null
  avg_hr: number | null; ts: string; source: string
}
export function mapCardio(r: CardioRow): CardioSession {
  return {
    id: r.id,
    sessionId: r.session_id ?? null,
    modality: r.modality,
    durationMin: r.duration_min,
    distanceKm: r.distance_km ?? null,
    avgHr: r.avg_hr ?? null,
    ts: r.ts,
    source: r.source,
  }
}

export interface MobilityRow { id: number; routine_id: string; ts: string; movements_json: string; completed: number }
export function mapMobility(r: MobilityRow): MobilitySession {
  return { id: r.id, routineId: r.routine_id, ts: r.ts, movements: parseJson<string[]>(r.movements_json, []), completed: bool(r.completed) }
}

export interface BodyMetricRow { id: number; ts: string; type: string; value: number; unit: string; source: string }
export function mapBodyMetric(r: BodyMetricRow): BodyMetric {
  return { id: r.id, ts: r.ts, type: r.type as BodyMetric['type'], value: r.value, unit: r.unit, source: r.source as BodyMetric['source'] }
}

export interface PhotoRow { id: number; ts: string; angle: string; uri: string }
export function mapPhoto(r: PhotoRow): ProgressPhoto {
  return { id: r.id, ts: r.ts, angle: r.angle as ProgressPhoto['angle'], uri: r.uri }
}

export interface MealRow {
  id: number; ts: string; meal_type: string; photo_uri: string | null; notes: string; source: string
  saved_name: string | null; is_saved: number
}
export function mapMeal(r: MealRow, items: FoodItem[] = []): Meal {
  return {
    id: r.id,
    ts: r.ts,
    mealType: r.meal_type as Meal['mealType'],
    photoUri: r.photo_uri ?? null,
    notes: r.notes ?? '',
    source: r.source as Meal['source'],
    savedName: r.saved_name ?? null,
    isSaved: bool(r.is_saved),
    items,
  }
}

export interface FoodItemRow {
  id: number; meal_id: number; food_name: string; quantity_g: number; serving_description: string
  kcal: number; protein_g: number; carbs_g: number; fat_g: number; source: string
  confidence: number | null; uncertainty_reason: string | null
}
export function mapFoodItem(r: FoodItemRow): FoodItem {
  return {
    id: r.id,
    mealId: r.meal_id,
    foodName: r.food_name,
    quantityG: r.quantity_g,
    servingDescription: r.serving_description ?? '',
    kcal: r.kcal,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    source: r.source,
    confidence: r.confidence ?? null,
    uncertaintyReason: r.uncertainty_reason ?? null,
  }
}

export interface MacrosRow { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
export function mapMacros(r: MacrosRow | null): Macros {
  return {
    kcal: round1(r?.kcal ?? 0),
    proteinG: round1(r?.protein_g ?? 0),
    carbsG: round1(r?.carbs_g ?? 0),
    fatG: round1(r?.fat_g ?? 0),
  }
}

export interface TargetRow {
  id: number; start_date: string; end_date: string | null; kcal: number; protein_g: number
  carbs_g: number; fat_g: number; rationale: string
}
export function mapTarget(r: TargetRow): NutritionTarget {
  return {
    id: r.id,
    startDate: r.start_date,
    endDate: r.end_date ?? null,
    kcal: r.kcal,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
    rationale: r.rationale ?? '',
  }
}

export interface SleepRow { id: number; start_ts: string; end_ts: string; duration_min: number; source: string; quality: number | null }
export function mapSleep(r: SleepRow): SleepRecord {
  return {
    id: r.id,
    startTs: r.start_ts,
    endTs: r.end_ts,
    durationMin: r.duration_min,
    source: r.source as SleepRecord['source'],
    quality: r.quality ?? null,
  }
}

export interface HealthMetricRow { id: number; ts: string; type: string; value: number; unit: string; source: string }
export function mapHealthMetric(r: HealthMetricRow): HealthMetric {
  return { id: r.id, ts: r.ts, type: r.type as HealthMetric['type'], value: r.value, unit: r.unit, source: r.source }
}

export interface CheckInRow { id: number; date: string; energy: number | null; soreness: number | null; stress: number | null; notes: string }
export function mapCheckIn(r: CheckInRow): DailyCheckIn {
  return { id: r.id, date: r.date, energy: r.energy ?? null, soreness: r.soreness ?? null, stress: r.stress ?? null, notes: r.notes ?? '' }
}

export interface DecisionRow {
  id: number; ts: string; kind: string; title: string; rationale: string; evidence_json: string; action_json: string
  status: string; result_notes: string; decided_at: string | null
}
const EMPTY_ACTION: ProposedAction = { kind: 'note', payload: {}, summary: '' }
export function mapDecision(r: DecisionRow): CoachDecision {
  return {
    id: r.id,
    ts: r.ts,
    kind: r.kind,
    title: r.title,
    rationale: r.rationale,
    evidence: parseJson<Evidence[]>(r.evidence_json, []),
    action: parseJson<ProposedAction>(r.action_json, EMPTY_ACTION),
    status: r.status as CoachDecision['status'],
    resultNotes: r.result_notes ?? '',
    decidedAt: r.decided_at ?? null,
  }
}

export interface MessageRow { id: number; ts: string; role: string; content: string; evidence_json: string }
export function mapMessage(r: MessageRow): CoachMessage {
  return { id: r.id, ts: r.ts, role: r.role as CoachMessage['role'], content: r.content, evidence: parseJson<Evidence[]>(r.evidence_json, []) }
}

export interface VoiceRow { id: number; ts: string; transcript: string; intent: string; payload_json: string; status: string }
export function mapVoice(r: VoiceRow): VoiceCommandRecord {
  return {
    id: r.id,
    ts: r.ts,
    transcript: r.transcript,
    intent: r.intent,
    payload: parseJson<Record<string, unknown>>(r.payload_json, {}),
    status: r.status as VoiceCommandRecord['status'],
  }
}

export interface LedgerRow { id: number; ts: string; provider: string; data_type: string; purpose: string; bytes: number; status: string }
export function mapLedger(r: LedgerRow): LedgerEntry {
  return { id: r.id, ts: r.ts, provider: r.provider, dataType: r.data_type, purpose: r.purpose, bytes: r.bytes ?? 0, status: r.status as LedgerEntry['status'] }
}

export interface MoodRow { id: number; ts: string; kind: string; valence: number; labels_json: string; contexts_json: string; note: string }
export function mapMood(r: MoodRow): MoodLog {
  return {
    id: r.id,
    ts: r.ts,
    kind: r.kind as MoodLog['kind'],
    valence: r.valence,
    labels: parseJson<string[]>(r.labels_json, []),
    contexts: parseJson<string[]>(r.contexts_json, []),
    note: r.note ?? '',
  }
}

export interface MindSessionRow {
  id: number; ts: string; kind: string; technique: string; duration_sec: number; completed: number
  valence_before: number | null; valence_after: number | null
}
export function mapMindSession(r: MindSessionRow): MindSession {
  return {
    id: r.id,
    ts: r.ts,
    kind: r.kind as MindSession['kind'],
    technique: r.technique ?? '',
    durationSec: r.duration_sec ?? 0,
    completed: bool(r.completed),
    valenceBefore: r.valence_before ?? null,
    valenceAfter: r.valence_after ?? null,
  }
}

export interface JournalRow { id: number; ts: string; prompt_id: string; prompt: string; text: string; tags_json: string }
export function mapJournal(r: JournalRow): JournalEntry {
  return { id: r.id, ts: r.ts, promptId: r.prompt_id ?? '', prompt: r.prompt ?? '', text: r.text ?? '', tags: parseJson<string[]>(r.tags_json, []) }
}

export interface HealthReportRow {
  id: number; ts: string; kind: string; title: string; file_name: string; media_type: string; file_data_url: string | null
  status: string; summary: string; markers_json: string; notes: string
}
export function mapHealthReport(r: HealthReportRow): HealthReport {
  return {
    id: r.id,
    ts: r.ts,
    kind: r.kind as HealthReport['kind'],
    title: r.title ?? '',
    fileName: r.file_name ?? '',
    mediaType: r.media_type ?? '',
    fileDataUrl: r.file_data_url ?? null,
    status: r.status as HealthReport['status'],
    summary: r.summary ?? '',
    markers: parseJson<ReportMarker[]>(r.markers_json, []),
    notes: r.notes ?? '',
  }
}
