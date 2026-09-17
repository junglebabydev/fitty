// Domain types mirroring the SQLite schema (src/db/schema.ts).
// Dates: ISO 8601 strings. Local calendar dates: 'YYYY-MM-DD'.

export type Readiness = 'GREEN' | 'AMBER' | 'RED'
export type Units = 'metric' | 'imperial'
export type Region = 'knee_left' | 'knee_right' | 'back_lower' | 'back_mid' | 'back_upper' | 'neck' | 'shoulder' | 'hip' | 'other'

export interface UserProfile {
  name: string
  dob: string
  sex: 'male' | 'female' | 'other'
  heightCm: number
  units: Units
  experience: 'beginner' | 'intermediate' | 'advanced'
  dietPattern: string
  equipment: string[]
  mobilityPriorities: string[]
  coachStyle: 'demanding' | 'balanced' | 'gentle'
  trainingDaysMin: number
  trainingDaysTarget: number
  trainingDaysStretch: number
  onboarded: boolean
}

export interface Goal {
  id: number
  type: 'weight' | 'waist' | 'strength' | 'habit'
  targetValue: number
  unit: string
  priority: number
  startDate: string
  targetDate: string | null
  status: 'active' | 'done' | 'paused'
}

export interface ConditionFlag {
  id: number
  region: Region
  label: string
  baselineNotes: string
}

export interface RedFlags {
  locking?: boolean
  givingWay?: boolean
  numbness?: boolean
  weakness?: boolean
  radiating?: boolean
  swelling?: boolean
}

export interface SymptomCheck {
  id: number
  ts: string
  region: Region
  painScore: number // 0-10
  redFlags: RedFlags
  notes: string
  context: 'morning' | 'pre_workout' | 'during_workout' | 'post_workout' | 'voice' | 'manual'
  sessionId: number | null
  /** Exercise a Pain / Issue report was filed against (during_workout), so progression can hold even when no set was logged. */
  exerciseId?: string | null
}

export type SafetyTag =
  | 'knee_load' | 'deep_knee_flexion' | 'impact'
  | 'spinal_load' | 'spinal_flexion' | 'axial_load'
  | 'neck_load' | 'overhead'

export interface Exercise {
  id: string
  name: string
  equipment: string
  primaryMuscles: string[]
  secondaryMuscles: string[]
  pattern: string
  safetyTags: SafetyTag[]
  substitutions: string[]
  instructions: string
  timed: boolean
}

export interface PlannedExercise {
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  loadKg: number | null
  restSec: number
  substitutedFrom?: string
  substitutionReason?: string
  /** Set when a Pain / Issue report reduced the load mid-session; progression holds at loadKg. */
  reducedReason?: string
}

export type SessionType = 'strength' | 'conditioning' | 'swim' | 'mobility'
export type SessionStatus = 'planned' | 'in_progress' | 'completed' | 'skipped'

export interface WorkoutSession {
  id: number
  templateKey: string
  name: string
  type: SessionType
  tier: 'minimum' | 'target' | 'stretch'
  scheduledDate: string
  status: SessionStatus
  startedAt: string | null
  completedAt: string | null
  durationMin: number | null
  readiness: Readiness | null
  sessionRpe: number | null
  notes: string
  exercises: PlannedExercise[]
}

export interface ExerciseSet {
  id: number
  sessionId: number
  exerciseId: string
  setIndex: number
  reps: number | null
  loadKg: number | null
  rir: number | null
  rpe: number | null
  durationSec: number | null
  painFlag: boolean
  loggedAt: string
}

export interface CardioSession {
  id: number
  sessionId: number | null
  modality: string
  durationMin: number
  distanceKm: number | null
  avgHr: number | null
  ts: string
  source: string
}

export interface MobilitySession {
  id: number
  routineId: string
  ts: string
  movements: string[]
  completed: boolean
}

export interface BodyMetric {
  id: number
  ts: string
  type: 'weight' | 'waist' | 'bodyfat'
  value: number
  unit: string
  source: 'manual' | 'voice' | 'healthkit' | 'seed'
}

export interface ProgressPhoto {
  id: number
  ts: string
  angle: 'front' | 'side' | 'back'
  uri: string
}

export type MealSource = 'photo' | 'voice' | 'search' | 'clone' | 'manual' | 'seed'

export interface FoodItem {
  id: number
  mealId: number
  foodName: string
  quantityG: number
  servingDescription: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  source: string
  confidence: number | null
  uncertaintyReason: string | null
}

export interface Meal {
  id: number
  ts: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink'
  photoUri: string | null
  notes: string
  source: MealSource
  savedName: string | null
  isSaved: boolean
  items: FoodItem[]
}

export interface NutritionTarget {
  id: number
  startDate: string
  endDate: string | null
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  rationale: string
}

export interface SleepRecord {
  id: number
  startTs: string
  endTs: string
  durationMin: number
  source: 'healthkit' | 'manual' | 'seed'
  quality: number | null
}

export interface HealthMetric {
  id: number
  ts: string
  type: 'resting_hr' | 'steps' | 'active_energy' | 'hrv'
  value: number
  unit: string
  source: string
}

export interface DailyCheckIn {
  id: number
  date: string
  energy: number | null
  soreness: number | null
  stress: number | null
  notes: string
}

export type DecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'reverted'

export interface Evidence {
  label: string
  value: string
}

export interface ProposedAction {
  kind: 'nutrition_target' | 'reflow_week' | 'deload' | 'substitute' | 'volume' | 'note'
  payload: Record<string, unknown>
  summary: string
}

export interface CoachDecision {
  id: number
  ts: string
  kind: string
  title: string
  rationale: string
  evidence: Evidence[]
  action: ProposedAction
  status: DecisionStatus
  resultNotes: string
  decidedAt: string | null
}

export interface CoachMessage {
  id: number
  ts: string
  role: 'user' | 'coach'
  content: string
  evidence: Evidence[]
}

export interface VoiceCommandRecord {
  id: number
  ts: string
  transcript: string
  intent: string
  payload: Record<string, unknown>
  status: 'previewed' | 'applied' | 'discarded' | 'unrecognized'
}

export interface LedgerEntry {
  id: number
  ts: string
  provider: string
  dataType: string
  purpose: string
  bytes: number
  status: 'sent' | 'local_only' | 'failed'
}

export interface Macros { kcal: number; proteinG: number; carbsG: number; fatG: number }

// --- Mind pillar (non-clinical; journal text stays on the device and is never sent to the AI coach) ---

export interface MoodLog {
  id: number
  ts: string
  kind: 'momentary' | 'daily'
  valence: number // -3..3 integer
  labels: string[]
  contexts: string[]
  note: string
}

export interface MindSession {
  id: number
  ts: string
  kind: 'breathing' | 'winddown' | 'meditation'
  technique: string
  durationSec: number
  completed: boolean
  valenceBefore: number | null
  valenceAfter: number | null
}

export interface JournalEntry {
  id: number
  ts: string
  promptId: string
  prompt: string
  text: string
  tags: string[]
}

// --- Health reports (context only: values are transcribed as printed; this app never interprets medical results) ---

export type ReportKind = 'blood' | 'body_composition' | 'clinical_note' | 'imaging' | 'other'
export type ReportFlag = 'low' | 'normal' | 'high' | 'unknown'

export interface ReportMarker {
  name: string
  value: number | null
  valueText: string
  unit: string
  /** Reference range exactly as printed on the report; null when the report prints none. */
  refLow: number | null
  refHigh: number | null
  flag: ReportFlag
  category: string
}

export interface HealthReport {
  id: number
  ts: string
  kind: ReportKind
  title: string
  fileName: string
  mediaType: string
  /** Original file as a data URL when it was small enough to keep; otherwise null. */
  fileDataUrl: string | null
  status: 'extracted' | 'manual' | 'failed'
  summary: string
  markers: ReportMarker[]
  notes: string
}
