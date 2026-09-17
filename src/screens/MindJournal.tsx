// One-prompt journal. Entries live in the local database only: nothing here is read by the
// coach facts or the AI gateway (see src/db/repositories/mind.ts).
import { useEffect, useId, useRef, useState } from 'react'
import { Lock, Pencil, Plus, Shuffle, Trash2 } from 'lucide-react'
import { Button, Chip, IconButton, Screen, Sheet } from '../components'
import { useQuery, useToast } from '../hooks'
import { addJournalEntry, deleteJournalEntry, getJournalEntries, updateJournalEntry } from '../db/repositories'
import { JOURNAL_KIND_LABELS, JOURNAL_PROMPTS, MOOD_CONTEXTS, promptForDate, type JournalPrompt } from '../engine/mind'
import type { JournalEntry } from '../domain/types'
import { dateOf, fmtDate, fmtTime, nowIso, todayStr } from '../lib/util'
import { nextPrompt, promptBody, toggleIn } from '../features/mind/helpers'

/** The list opens with the latest few; the rest sit behind "See all". */
const RECENT_COUNT = 3

const promptById = (id: string): JournalPrompt | null => JOURNAL_PROMPTS.find((p) => p.id === id) ?? null

export default function MindJournalScreen() {
  const toast = useToast()
  const textId = useId()
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const [prompt, setPrompt] = useState<JournalPrompt>(() => promptForDate(todayStr()))
  const [text, setText] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [editing, setEditing] = useState<JournalEntry | null>(null)
  const [deleting, setDeleting] = useState<JournalEntry | null>(null)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const entries = useQuery(() => getJournalEntries(50), [])

  // Auto-grow: the page scrolls, the textarea never does.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const shuffle = () => {
    const next = nextPrompt(JOURNAL_PROMPTS, prompt.id)
    if (next) setPrompt(next)
  }

  const clear = () => {
    setEditing(null)
    setText('')
    setTags([])
    setTagsOpen(false)
    setPrompt(promptForDate(todayStr()))
  }

  const save = () => {
    const body = text.trim()
    if (!body) return
    try {
      if (editing) {
        updateJournalEntry(editing.id, { text: body, tags })
        toast.show('Entry updated', 'info')
      } else {
        addJournalEntry({ ts: nowIso(), promptId: prompt.id, prompt: prompt.text, text: body, tags })
        toast.show('Saved on this device', 'info')
      }
      clear()
    } catch {
      toast.show("Couldn't save that. Your words are still in the box.", 'error')
    }
  }

  const startEdit = (e: JournalEntry) => {
    setEditing(e)
    setText(e.text)
    setTags(e.tags)
    setTagsOpen(e.tags.length > 0)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    areaRef.current?.focus({ preventScroll: true })
  }

  const confirmDelete = () => {
    if (!deleting) return
    deleteJournalEntry(deleting.id)
    if (editing?.id === deleting.id) clear()
    setDeleting(null)
    toast.show('Entry deleted', 'info')
  }

  // An entry being edited may carry tags from outside the standard list (seeded or older data); keep them toggleable.
  const tagOptions = [...MOOD_CONTEXTS, ...tags.filter((t) => !MOOD_CONTEXTS.includes(t))]
  const shownPrompt = editing ? editing.prompt : prompt.text
  const shownKind = editing ? promptById(editing.promptId)?.kind ?? null : prompt.kind
  const visible = showAll ? entries : entries.slice(0, RECENT_COUNT)

  return (
    <Screen pillar="mind" back="/mind" backLabel="Mind" title="Journal">
      <div className="flex flex-col gap-6 pb-16">
        <section aria-label={editing ? 'Edit entry' : 'Write'} className="anim-rise flex flex-col gap-4 rounded-[1.25rem] border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow m-0 text-pillar">
                {editing ? `Editing · ${fmtDate(dateOf(editing.ts))}` : shownKind ? JOURNAL_KIND_LABELS[shownKind] : 'Prompt'}
                {editing && shownKind ? ` · ${JOURNAL_KIND_LABELS[shownKind]}` : ''}
              </p>
              {shownPrompt && <p className="voice m-0 mt-2 text-2xl text-app">{shownKind ? promptBody(shownPrompt) : shownPrompt}</p>}
            </div>
            {!editing && (
              <IconButton icon={<Shuffle size={20} />} label="Show a different prompt" variant="surface" onClick={shuffle} className="rounded-full" />
            )}
          </div>

          <div>
            <label htmlFor={textId} className="sr-only">Your entry</label>
            <textarea
              id={textId}
              ref={areaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Start anywhere."
              className="block min-h-[15rem] w-full resize-none overflow-hidden rounded-2xl border border-line bg-surface-2 px-4 py-3.5 font-serif text-[19px] leading-[1.6] text-app focus:border-pillar-line"
            />
          </div>

          {tagsOpen ? (
            <fieldset className="anim-fade-in m-0 border-0 p-0">
              <legend className="eyebrow mb-2 p-0 text-muted">Tags</legend>
              <div className="flex flex-wrap gap-2">
                {tagOptions.map((t) => (
                  <Chip key={t} className="min-h-11" selected={tags.includes(t)} check onClick={() => setTags((cur) => toggleIn(cur, t))}>{t}</Chip>
                ))}
              </div>
            </fieldset>
          ) : (
            <button type="button" onClick={() => setTagsOpen(true)} className="press inline-flex min-h-11 items-center gap-2 self-start text-[15px] font-medium text-pillar">
              <Plus size={18} aria-hidden /> Add tags
            </button>
          )}

          <p className="m-0 flex items-center gap-2 text-sm text-muted">
            <Lock size={16} className="shrink-0 text-pillar" aria-hidden />
            <span>Stays on this device.</span>
          </p>

          <div className="flex gap-2">
            <Button size="lg" full disabled={text.trim().length === 0} onClick={save}>{editing ? 'Save changes' : 'Save entry'}</Button>
            {editing && <Button variant="secondary" size="lg" onClick={clear}>Cancel</Button>}
          </div>
        </section>

        <section aria-label="Entries" className="anim-rise flex flex-col gap-3" style={{ animationDelay: '55ms' }}>
          <h2 className="eyebrow m-0 text-pillar">Entries</h2>
          {entries.length === 0 ? (
            <p className="voice m-0 px-1 py-6 text-center text-xl text-muted">Nothing written yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {visible.map((e) => {
                const kind = promptById(e.promptId)?.kind
                return (
                  <li key={e.id} className="rounded-[1.25rem] border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="eyebrow m-0 text-muted">
                          {fmtDate(dateOf(e.ts))} · {fmtTime(e.ts)}{kind ? ` · ${JOURNAL_KIND_LABELS[kind]}` : ''}
                        </p>
                        {e.prompt && <p className="voice m-0 mt-1.5 text-[15px] text-muted">{kind ? promptBody(e.prompt) : e.prompt}</p>}
                      </div>
                      <div className="-mr-2 -mt-2 flex shrink-0 gap-1">
                        <IconButton icon={<Pencil size={18} />} label={`Edit entry from ${fmtDate(dateOf(e.ts))}`} onClick={() => startEdit(e)} />
                        <IconButton icon={<Trash2 size={18} />} label={`Delete entry from ${fmtDate(dateOf(e.ts))}`} onClick={() => setDeleting(e)} />
                      </div>
                    </div>
                    <p className="m-0 mt-2 whitespace-pre-wrap break-words font-serif text-[17px] leading-[1.6] text-app">{e.text}</p>
                    {e.tags.length > 0 && (
                      <ul className="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0" aria-label="Tags">
                        {e.tags.map((t) => (
                          <li key={t} className="rounded-full border border-line px-2.5 py-0.5 text-[13px] text-muted">{t}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {entries.length > RECENT_COUNT && (
            <Button variant="ghost" full onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `See all ${entries.length}`}
            </Button>
          )}
        </section>
      </div>

      <Sheet
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this entry?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" full onClick={() => setDeleting(null)}>Keep it</Button>
            <Button variant="danger" size="lg" full icon={<Trash2 size={18} />} onClick={confirmDelete}>Delete</Button>
          </div>
        }
      >
        <p className="m-0 text-base text-muted">
          {deleting ? `Your entry from ${fmtDate(dateOf(deleting.ts))} will be removed from this device. This cannot be undone.` : ''}
        </p>
      </Sheet>
    </Screen>
  )
}
