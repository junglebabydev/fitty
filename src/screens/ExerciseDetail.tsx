import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftRight, ChevronDown, CircleAlert, ShieldCheck, TriangleAlert, Trophy } from 'lucide-react'
import type { Exercise } from '../domain/types'
import { Button, Card, EmptyState, ExerciseVisual, LineChart, MuscleMap, Screen } from '../components'
import { exerciseMedia } from '../data/exerciseMedia'
import { useQuery } from '../hooks'
import { exerciseHistory } from '../db/repositories'
import { TIMED_IDS } from '../engine'
import { dayName, fmtDate } from '../lib/util'
import { SAFETY_TAG_PLAIN, SAFETY_TAG_SHORT, bestEffort, bestSet, exerciseMap, fmtLoad, fmtSec, libraryExercises, rirSummary, summarizeSets } from '../features/workout'

/** First 3–4 sentences of the instructions as short cues. */
function cuesOf(instructions: string): string[] {
  return instructions.split(/(?<=[.!?])\s+/).map((c) => c.trim()).filter(Boolean).slice(0, 4)
}

/** Exercise detail (DESIGN §10): photo / muscle hero, demo, muscle map, short cues, safety rows, e1RM trend; history behind a tap. */
export default function ExerciseDetailScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const library = useQuery(libraryExercises, [])
  const byId = useMemo(() => exerciseMap(library), [library])
  const exercise = byId.get(id) ?? null
  const history = useQuery(() => (exercise ? exerciseHistory(exercise.id, 12) : []), [exercise?.id])
  const [historyOpen, setHistoryOpen] = useState(false)

  if (!exercise) {
    return (
      <Screen pillar="train" title="Exercise" back>
        <EmptyState
          icon={<CircleAlert size={28} />}
          title="Exercise not found"
          body={`No exercise with id “${id}” in the library.`}
          action={<Button variant="primary" onClick={() => navigate('/train')}>Back to Train</Button>}
        />
      </Screen>
    )
  }

  const timed = exercise.timed || TIMED_IDS.has(exercise.id)
  const chronological = [...history].reverse()
  const series = chronological.map((h) => ({ x: fmtDate(h.date), y: bestEffort(h.sets, timed) }))
  const values = series.map((p) => p.y).filter((v): v is number => v != null)
  const allSets = history.flatMap((h) => h.sets)
  const best = bestSet(allSets, timed)
  const bestValue = bestEffort(allSets, timed)
  const bestSession = best ? history.find((h) => h.sets.some((x) => x.id === best.id)) ?? null : null
  const painSessions = history.filter((h) => h.sets.some((s) => s.painFlag)).length
  const subs = exercise.substitutions.map((sid) => byId.get(sid)).filter((e): e is Exercise => !!e)
  // Loaded lifts are tracked as e1RM (kg); timed holds in seconds; unloaded work in reps.
  const loaded = !timed && allSets.some((s) => s.loadKg != null && s.reps != null)
  const unit = timed ? 's' : loaded ? 'kg' : 'reps'
  const metric = timed ? 'Best hold' : loaded ? 'Best est. 1RM' : 'Best reps'
  const fmtValue = (n: number) => (loaded ? n.toFixed(1) : String(Math.round(n)))

  // Interpreted headline above the chart (first vs latest session).
  let headline = ''
  if (values.length >= 2) {
    const delta = values[values.length - 1] - values[0]
    const since = chronological.find((h) => bestEffort(h.sets, timed) != null)
    const sinceText = since ? ` since ${fmtDate(since.date)}` : ''
    if (Math.abs(delta) < (loaded ? 0.5 : 1)) headline = `Holding steady at ${fmtValue(values[values.length - 1])} ${unit}${sinceText}.`
    else headline = `${delta > 0 ? 'Up' : 'Down'} ${fmtValue(Math.abs(delta))} ${unit}${sinceText}.`
  }

  const media = exerciseMedia(exercise.id)

  return (
    <Screen pillar="train" title={exercise.name} back eyebrow={`${exercise.equipment} · ${exercise.pattern.replace(/_/g, ' ')}${timed ? ' · timed' : ''}`}>
      <div className="flex flex-col gap-3 pb-32">
        {/* Hero: the movement itself (animation, photos or muscle map), with the credit and a quiet way out to YouTube */}
        <div className="anim-rise">
          <ExerciseVisual exercise={exercise} size="hero" />
          <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[12px] text-faint">
            <span>{media.animation ? 'Animation: ExerciseDB' : ''}</span>
            <a
              href={media.demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex min-h-11 items-center underline underline-offset-2"
              aria-label={`Search YouTube for ${exercise.name} form (opens in a new tab)`}
            >
              Search YouTube
            </a>
          </div>
        </div>

        {/* Muscles */}
        <Card eyebrow="Muscles" className="anim-rise">
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <MuscleMap primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} size={190} pillar="train" ariaLabel={`Primary: ${exercise.primaryMuscles.join(', ')}${exercise.secondaryMuscles.length ? `. Secondary: ${exercise.secondaryMuscles.join(', ')}` : ''}`} />
            </div>
            <dl className="min-w-0 flex-1 flex flex-col gap-3 text-[15px]">
              <div>
                <dt className="eyebrow text-pillar flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-pillar" aria-hidden />Primary</dt>
                <dd className="capitalize mt-1 leading-snug">{exercise.primaryMuscles.join(', ')}</dd>
              </div>
              {exercise.secondaryMuscles.length > 0 && (
                <div>
                  <dt className="eyebrow text-muted flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-pillar-line bg-pillar-soft" aria-hidden />Secondary</dt>
                  <dd className="capitalize mt-1 leading-snug text-muted">{exercise.secondaryMuscles.join(', ')}</dd>
                </div>
              )}
            </dl>
          </div>
        </Card>

        {/* Cues */}
        <Card eyebrow="How to" className="anim-rise">
          <ol className="flex flex-col gap-2.5">
            {cuesOf(exercise.instructions).map((c, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="num text-xl text-pillar w-5 text-center shrink-0 leading-tight" aria-hidden>{i + 1}</span>
                <span className="text-[15px] leading-snug">{c}</span>
              </li>
            ))}
          </ol>
        </Card>

        {/* Best */}
        {bestValue != null && (
          <Card pillar="train" className="anim-rise">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="eyebrow text-pillar">{metric}</div>
                <div className="mt-1.5 flex items-baseline gap-1.5"><span className="num text-6xl text-app">{fmtValue(bestValue)}</span><span className="text-sm font-medium text-muted">{unit}</span></div>
              </div>
              {best && (
                <div className="text-right text-[13px] text-muted tnum leading-snug pb-1">
                  <div className="text-app font-medium">{timed ? (best.durationSec != null ? fmtSec(best.durationSec) : `${best.reps ?? '—'} reps`) : `${fmtLoad(best.loadKg)} × ${best.reps ?? '—'}`}</div>
                  {bestSession && <div>{dayName(bestSession.date)} {fmtDate(bestSession.date)}</div>}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Trend */}
        {history.length > 0 && (
          <Card eyebrow={timed ? 'Best time per session' : loaded ? 'Estimated 1RM per session' : 'Best reps per session'} className="anim-rise">
            <p className="text-[17px] font-semibold leading-snug text-app">{headline || `Session ${values.length} of 2 — the trend appears after your next one.`}</p>
            <div className="mt-3">
              <LineChart
                points={series}
                height={150}
                pillar="train"
                showDots
                yFormat={(n) => (loaded ? n.toFixed(1) : String(Math.round(n)))}
                ariaLabel={`${exercise.name}: ${metric.toLowerCase()} per session. ${headline}`}
              />
            </div>
          </Card>
        )}

        {/* Safety */}
        <Card eyebrow="Safety" className="anim-rise">
          {exercise.safetyTags.length === 0 ? (
            <div className="flex items-start gap-2.5">
              <ShieldCheck size={18} className="text-ok shrink-0 mt-0.5" aria-hidden />
              <p className="text-[15px] leading-snug">No safety flags.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {exercise.safetyTags.map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <TriangleAlert size={18} className="text-warn shrink-0 mt-0.5" aria-hidden />
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold leading-tight">{SAFETY_TAG_SHORT[t]}</div>
                    <div className="text-sm text-muted leading-snug mt-0.5">{SAFETY_TAG_PLAIN[t]}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Substitutions */}
        {subs.length > 0 && (
          <Card eyebrow="Swaps" action={<ArrowLeftRight size={16} className="text-muted" aria-hidden />}>
            <ul className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4">
              {subs.map((x) => (
                <li key={x.id} className="shrink-0 w-[132px]">
                  <button type="button" onClick={() => navigate(`/train/exercise/${x.id}`)} className="press w-full text-left" aria-label={`${x.name}${x.safetyTags.length ? ` — ${x.safetyTags.map((t) => SAFETY_TAG_SHORT[t]).join(', ')}` : ''}`}>
                    <ExerciseVisual exercise={x} size="card" />
                    <span className="block mt-1.5 text-[13px] font-semibold leading-tight line-clamp-2 text-app">{x.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* History table */}
        {history.length > 0 && !historyOpen && (
          <Button variant="secondary" full icon={<ChevronDown size={16} />} aria-expanded={false} onClick={() => setHistoryOpen(true)}>See history</Button>
        )}
        {history.length > 0 && historyOpen && (
          <Card flush eyebrow="History" subtitle={`${history.length} session${history.length === 1 ? '' : 's'}${painSessions ? ` · pain flagged in ${painSessions}` : ''}`}>
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] gap-2 px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint" aria-hidden>
              <span>Date</span><span>Sets</span><span className="text-right">{timed ? 'Best' : loaded ? 'e1RM' : 'Best'}</span>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {history.map((h) => {
                const v = bestEffort(h.sets, timed)
                const isBest = v != null && bestValue != null && v >= bestValue
                const pain = h.sets.some((s) => s.painFlag)
                return (
                  <li key={h.sessionId}>
                    <button type="button" className="w-full min-h-[52px] grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] gap-2 items-center px-4 py-2 text-left active:bg-surface-2" onClick={() => navigate(`/train/session/${h.sessionId}`)}>
                      <span className="text-[13px] text-muted leading-tight">{dayName(h.date)}<br />{fmtDate(h.date)}</span>
                      <span className="min-w-0">
                        <span className="block text-sm tnum truncate">{summarizeSets(h.sets, timed)}</span>
                        <span className="flex items-center gap-2 text-xs text-muted">
                          {rirSummary(h.sets) && <span>{rirSummary(h.sets)}</span>}
                          {pain && <span className="inline-flex items-center gap-1 text-warn"><TriangleAlert size={12} aria-hidden />Pain flagged</span>}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="num text-xl text-app">{v != null ? fmtValue(v) : '—'}</span>
                        {isBest && <span className="flex items-center justify-end gap-1 text-[11px] font-semibold text-pillar"><Trophy size={11} aria-hidden />Best</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

      </div>
    </Screen>
  )
}
