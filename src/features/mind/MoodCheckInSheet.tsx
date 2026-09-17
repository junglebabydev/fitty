// State of Mind check-in. Built to take under 20 seconds: only the slider is required.
import { useEffect, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Wind } from 'lucide-react'
import { Button, Chip, MoodSlider, Sheet, Slider } from '../../components'
import { useToast } from '../../hooks'
import { addMoodLog, getCheckIn, getSessionsForDate, lastNightSleep, moodLogsForDate, symptomsForDate, upsertCheckIn } from '../../db/repositories'
import { MOOD_CONTEXTS, labelsForValence, suggestContexts, suggestTechnique } from '../../engine/mind'
import { hourNow, nowIso, todayStr } from '../../lib/util'
import { keepValidLabels, moodKindFor, toggleIn } from './helpers'

export interface MoodCheckInSheetProps {
  open: boolean
  onClose: () => void
}

/** Valence at or below this gets a calm breathing suggestion after saving (never a celebration). */
const LOW_MOOD = -2

export function MoodCheckInSheet({ open, onClose }: MoodCheckInSheetProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const noteId = useId()

  const [valence, setValence] = useState(0)
  const [touched, setTouched] = useState(false)
  const [labels, setLabels] = useState<string[]>([])
  const [contexts, setContexts] = useState<string[]>([])
  const [suggested, setSuggested] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [stress, setStress] = useState<number | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [needs, setNeeds] = useState({ stress: false, energy: false })
  const [saving, setSaving] = useState(false)
  const [afterLow, setAfterLow] = useState(false)

  // Fresh form each time the sheet opens; context suggestions come from what the app already knows about today.
  useEffect(() => {
    if (!open) return
    const today = todayStr()
    const pre = suggestContexts({
      trainedToday: getSessionsForDate(today).some((s) => s.status === 'completed'),
      sleepMin: lastNightSleep(today)?.durationMin ?? null,
      painToday: symptomsForDate(today).some((s) => s.painScore > 0),
    })
    const checkIn = getCheckIn(today)
    setValence(0)
    setTouched(false)
    setLabels([])
    setContexts(pre)
    setSuggested(pre)
    setNote('')
    setNoteOpen(false)
    setStress(null)
    setEnergy(null)
    setNeeds({ stress: checkIn?.stress == null, energy: checkIn?.energy == null })
    setSaving(false)
    setAfterLow(false)
  }, [open])

  const feelingWords = useMemo(() => labelsForValence(valence), [valence])
  const contextChips = useMemo(() => [...suggested, ...MOOD_CONTEXTS.filter((c) => !suggested.includes(c))], [suggested])

  const onMood = (v: number) => {
    setValence(v)
    setTouched(true)
    setLabels((cur) => keepValidLabels(cur, labelsForValence(v)))
  }

  const save = () => {
    if (!touched || saving) return
    setSaving(true)
    try {
      const today = todayStr()
      addMoodLog({ ts: nowIso(), kind: moodKindFor(moodLogsForDate(today).length), valence, labels, contexts, note: note.trim() })
      if (stress != null || energy != null) {
        const existing = getCheckIn(today)
        upsertCheckIn({
          date: today,
          energy: energy ?? existing?.energy ?? null,
          soreness: existing?.soreness ?? null,
          stress: stress ?? existing?.stress ?? null,
          notes: existing?.notes ?? '',
        })
      }
      if (valence <= LOW_MOOD) {
        setAfterLow(true)
      } else {
        toast.show('Check-in saved', 'info')
        onClose()
      }
    } catch {
      toast.show("Couldn't save that. Try once more.", 'error')
    } finally {
      setSaving(false)
    }
  }

  const breathe = () => {
    const pick = suggestTechnique({ stress, valence, hourNow: hourNow(), sleepLastNightMin: lastNightSleep(todayStr())?.durationMin ?? null })
    onClose()
    navigate(`/mind/breathe?technique=${encodeURIComponent(pick.techniqueId)}`)
  }

  if (afterLow) {
    return (
      <Sheet open={open} onClose={onClose} title="Saved">
        <div data-pillar="mind" className="flex flex-col gap-5 pb-2 pt-2">
          <p className="voice m-0 text-2xl text-app">Thanks for being honest. Two slow minutes of breathing can help.</p>
          <div className="flex flex-col gap-2">
            <Button size="lg" full icon={<Wind size={20} />} onClick={breathe}>Breathe</Button>
            <Button variant="ghost" size="lg" full onClick={onClose}>Not now</Button>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How are you feeling?"
      footer={
        <Button size="lg" full disabled={!touched} loading={saving} onClick={save}>
          {touched ? 'Save' : 'Move the slider'}
        </Button>
      }
    >
      <div data-pillar="mind" className="flex flex-col gap-6 pb-2">
        <MoodSlider value={valence} onChange={onMood} />

        {touched && (
          <>
            <fieldset className="anim-fade-in m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="eyebrow mb-2 p-0 text-muted">Feels like</legend>
              <div className="flex flex-wrap gap-2">
                {feelingWords.map((w) => (
                  <Chip key={w} className="min-h-11" selected={labels.includes(w)} check onClick={() => setLabels((cur) => toggleIn(cur, w))}>{w}</Chip>
                ))}
              </div>
            </fieldset>

            <fieldset className="anim-fade-in m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="eyebrow mb-2 p-0 text-muted">About</legend>
              <div className="flex flex-wrap gap-2">
                {contextChips.map((c) => (
                  <Chip key={c} className="min-h-11" selected={contexts.includes(c)} check onClick={() => setContexts((cur) => toggleIn(cur, c))}>{c}</Chip>
                ))}
              </div>
            </fieldset>

            {(needs.stress || needs.energy) && (
              <div className="anim-fade-in flex flex-col gap-4 rounded-2xl border border-line bg-surface-2 p-4">
                {needs.stress && (
                  <Slider label="Stress" value={stress ?? 0} onChange={setStress} labels={['Calm', 'Very stressed']} suffix={stress == null ? ' not set' : '/10'} tone="neutral" />
                )}
                {needs.energy && (
                  <Slider label="Energy" value={energy ?? 0} onChange={setEnergy} labels={['Flat', 'Full']} suffix={energy == null ? ' not set' : '/10'} tone="neutral" />
                )}
              </div>
            )}

            {noteOpen ? (
              <div className="anim-fade-in flex flex-col gap-2">
                <label htmlFor={noteId} className="eyebrow text-muted">Note</label>
                <textarea
                  id={noteId}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  autoFocus
                  className="w-full resize-none rounded-2xl border border-line bg-surface-2 px-4 py-3 text-base text-app focus:border-pillar-line"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNoteOpen(true)}
                className="press anim-fade-in inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-medium text-pillar"
              >
                <Plus size={18} aria-hidden /> Add a note
              </button>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}
