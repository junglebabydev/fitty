import { useState, type ReactNode } from 'react'
import { ArrowUpRight, Camera, CircleAlert, CircleCheck, CloudOff, MessageSquare, Mic, Send, Smartphone, Trash2 } from 'lucide-react'
import { Button, Card, Screen, Sheet, StatTile, StatusPill } from '../components'
import type { Tone } from '../components'
import { clearLedger, clearVoiceCommands, getLedger, getVoiceCommands, pruneVoiceCommands } from '../db/repositories'
import type { LedgerEntry, VoiceCommandRecord } from '../domain/types'
import { useQuery, useToast } from '../hooks'
import { dateOf, fmtDate, fmtTime, todayStr } from '../lib/util'
import { fmtBytes } from '../features/settings/files'
import { DEFAULT_VOICE_RETENTION_DAYS, KEYS } from '../features/settings/keys'
import { useSetting } from '../features/settings/useSetting'

// Status is always icon + word, never colour alone.
const STATUS_TONE: Record<LedgerEntry['status'], Tone> = { sent: 'accent', local_only: 'neutral', failed: 'red' }
const STATUS_LABEL: Record<LedgerEntry['status'], string> = { sent: 'Sent', local_only: 'Local only', failed: 'Failed' }
const STATUS_ICON: Record<LedgerEntry['status'], ReactNode> = {
  sent: <ArrowUpRight size={12} />,
  local_only: <Smartphone size={12} />,
  failed: <CircleAlert size={12} />,
}

const VOICE_TONE: Record<VoiceCommandRecord['status'], Tone> = { applied: 'green', previewed: 'neutral', discarded: 'neutral', unrecognized: 'amber' }
const VOICE_LABEL: Record<VoiceCommandRecord['status'], string> = { applied: 'Applied', previewed: 'Previewed', discarded: 'Discarded', unrecognized: 'Not understood' }

function providerLabel(p: string): string {
  if (p === 'mock') return 'On-device demo'
  if (p === 'anthropic') return 'Anthropic'
  if (p === 'gemini') return 'Google Gemini'
  if (p === 'claude-code') return 'Claude Code on your Mac'
  if (p === 'worker:gemini') return 'Google Gemini, through your Cloudflare Worker'
  if (p === 'worker:anthropic') return 'Claude, through your Cloudflare Worker'
  if (p.startsWith('worker:')) return 'Your Cloudflare Worker'
  return p
}

function dataTypeLabel(t: string): string {
  if (t === 'meal_photo') return 'Meal photo'
  if (t === 'coach_context') return 'Coach context'
  return t.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function dataTypeIcon(t: string) {
  if (t === 'meal_photo') return <Camera size={15} />
  if (t === 'coach_context') return <MessageSquare size={15} />
  return <Send size={15} />
}

function intentLabel(intent: string): string {
  return intent.replace(/_/g, ' ')
}

/** Consecutive rows that share a calendar day (lists arrive newest first). */
function byDay<T extends { ts: string }>(rows: T[]): { day: string; rows: T[] }[] {
  const out: { day: string; rows: T[] }[] = []
  for (const r of rows) {
    const day = dateOf(r.ts)
    const last = out[out.length - 1]
    if (last && last.day === day) last.rows.push(r)
    else out.push({ day, rows: [r] })
  }
  return out
}

/** One timeline row: time on the left, a rail with a node, content on the right. */
function TimelineRow({ time, node, last, children }: { time: string; node: ReactNode; last: boolean; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-11 shrink-0 pt-1.5 text-[12px] text-muted tnum text-right">{time}</span>
      <span className="relative flex flex-col items-center shrink-0" aria-hidden>
        <span className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-line bg-surface-2 text-muted">{node}</span>
        {!last && <span className="w-px flex-1 bg-line" />}
      </span>
      <div className={last ? 'min-w-0 flex-1 pb-1' : 'min-w-0 flex-1 pb-5'}>{children}</div>
    </li>
  )
}

function DayHeader({ day, today }: { day: string; today: string }) {
  return <h3 className="eyebrow text-muted pl-14 pb-2.5">{day === today ? 'Today' : fmtDate(day)}</h3>
}

export default function PrivacyLedgerScreen() {
  const toast = useToast()
  const today = todayStr()
  const entries = useQuery(() => getLedger(100), [])
  const commands = useQuery(() => getVoiceCommands(50), [])
  const [retention] = useSetting<number>(KEYS.voiceRetentionDays, DEFAULT_VOICE_RETENTION_DAYS)
  const [confirm, setConfirm] = useState<'ledger' | 'voice' | null>(null)

  const sent = entries.filter((e) => e.status === 'sent')
  const local = entries.filter((e) => e.status === 'local_only').length
  const failed = entries.filter((e) => e.status === 'failed').length
  const sentBytes = sent.reduce((a, e) => a + e.bytes, 0)

  const prune = () => {
    const n = pruneVoiceCommands(retention)
    toast.show(n ? `Removed ${n} transcript${n === 1 ? '' : 's'} older than ${retention} days` : `Nothing older than ${retention} days`, n ? 'success' : 'info')
  }

  const doClear = () => {
    if (confirm === 'ledger') {
      clearLedger()
      toast.show('Ledger cleared', 'success')
    } else if (confirm === 'voice') {
      clearVoiceCommands()
      toast.show('Voice history cleared', 'success')
    }
    setConfirm(null)
  }

  return (
    <Screen title="Privacy ledger" pillar="neutral" back="/settings" backLabel="Settings">
      <div className="anim-rise">
        <p className="voice text-xl">What leaves this phone, written down. If it isn't listed here, it never left.</p>
        <p className="text-[14px] text-muted leading-snug mt-3">
          Your records live in a local database. The only outbound traffic is an AI call: a meal photo for recognition, or a compact coach context for chat. Readiness, progression, calorie math and safety gates run on-device, so they
          never appear here.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-5">
        <StatTile label="Sent" value={sent.length} sub={sent.length ? fmtBytes(sentBytes) : 'Nothing yet'} icon={ArrowUpRight} />
        <StatTile label="Local" value={local} sub="Stayed here" icon={Smartphone} />
        <StatTile label="Failed" value={failed} sub={failed ? 'Not delivered' : 'None'} icon={CircleAlert} />
      </div>

      <section className="pt-7" aria-labelledby="pl-ai">
        <div className="flex items-end justify-between gap-3 pb-3 min-h-[44px]">
          <div>
            <h2 id="pl-ai" className="display text-2xl">
              AI calls
            </h2>
            {entries.length > 0 && <p className="text-[13px] text-muted mt-0.5">Most recent {entries.length}, newest first</p>}
          </div>
          {entries.length > 0 && (
            <Button size="md" variant="ghost" icon={<Trash2 size={16} />} onClick={() => setConfirm('ledger')}>
              Clear
            </Button>
          )}
        </div>

        {entries.length === 0 ? (
          <Card>
            <div className="flex items-start gap-3 py-1">
              <CloudOff size={20} className="text-muted shrink-0 mt-1" aria-hidden />
              <div>
                <p className="voice text-lg">Nothing has been sent.</p>
                <p className="text-[14px] text-muted leading-snug mt-1">This list fills in as you use meal photos or coach chat.</p>
              </div>
            </div>
          </Card>
        ) : (
          <Card>
            {byDay(entries).map((g, gi, groups) => (
              <div key={g.day} className={gi > 0 ? 'pt-5' : undefined}>
                <DayHeader day={g.day} today={today} />
                <ol>
                  {g.rows.map((e, i) => (
                    <TimelineRow key={e.id} time={fmtTime(e.ts)} node={dataTypeIcon(e.dataType)} last={i === g.rows.length - 1 && gi === groups.length - 1}>
                      <div className="flex items-start justify-between gap-2 pt-1">
                        <div className="text-[15px] font-medium leading-tight">{dataTypeLabel(e.dataType)}</div>
                        <StatusPill tone={STATUS_TONE[e.status]} icon={STATUS_ICON[e.status]} size="sm" className="shrink-0">
                          {STATUS_LABEL[e.status]}
                        </StatusPill>
                      </div>
                      <p className="text-[14px] text-muted mt-1 leading-snug">{e.purpose}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <StatusPill tone="neutral" size="sm">
                          To {providerLabel(e.provider)}
                        </StatusPill>
                        <StatusPill tone="neutral" size="sm" className="tnum">
                          {fmtBytes(e.bytes)}
                        </StatusPill>
                      </div>
                    </TimelineRow>
                  ))}
                </ol>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="pt-7" aria-labelledby="pl-voice">
        <div className="flex items-end justify-between gap-3 pb-3 min-h-[44px]">
          <div className="min-w-0">
            <h2 id="pl-voice" className="display text-2xl">
              Voice commands
            </h2>
            <p className="text-[13px] text-muted mt-0.5 leading-snug">Transcripts stay on this phone and are pruned after {retention} days (Settings → Media retention).</p>
          </div>
          {commands.length > 0 && (
            <Button size="md" variant="ghost" icon={<Trash2 size={16} />} onClick={() => setConfirm('voice')} className="shrink-0">
              Clear
            </Button>
          )}
        </div>

        {commands.length === 0 ? (
          <Card>
            <div className="flex items-start gap-3 py-1">
              <Mic size={20} className="text-muted shrink-0 mt-1" aria-hidden />
              <div>
                <p className="voice text-lg">No voice commands yet.</p>
                <p className="text-[14px] text-muted leading-snug mt-1">Speech is transcribed on-device where the OS provides it. Transcripts are kept only to show what was heard.</p>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              {byDay(commands).map((g, gi, groups) => (
                <div key={g.day} className={gi > 0 ? 'pt-5' : undefined}>
                  <DayHeader day={g.day} today={today} />
                  <ol>
                    {g.rows.map((c, i) => (
                      <TimelineRow key={c.id} time={fmtTime(c.ts)} node={<Mic size={15} />} last={i === g.rows.length - 1 && gi === groups.length - 1}>
                        <p className="text-[15px] leading-snug break-words pt-1">“{c.transcript || '…'}”</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <StatusPill tone={VOICE_TONE[c.status]} icon={c.status === 'applied' ? <CircleCheck size={12} /> : c.status === 'unrecognized' ? <CircleAlert size={12} /> : undefined} size="sm">
                            {VOICE_LABEL[c.status]}
                          </StatusPill>
                          <StatusPill tone="neutral" size="sm">
                            {intentLabel(c.intent)}
                          </StatusPill>
                        </div>
                      </TimelineRow>
                    ))}
                  </ol>
                </div>
              ))}
            </Card>
            <Button variant="secondary" full className="mt-3" onClick={prune}>
              Prune older than {retention} days
            </Button>
          </>
        )}
      </section>

      <Sheet
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'ledger' ? 'Clear the ledger?' : 'Clear voice history?'}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant="danger" full onClick={doClear}>
              Clear
            </Button>
          </div>
        }
      >
        <p className="text-[15px] leading-snug">
          {confirm === 'ledger'
            ? 'This removes the local record of past AI calls. It does not affect anything already sent, and new calls will keep being logged.'
            : 'This deletes every stored transcript. Actions already applied from those commands (meals, sets, weights) are kept.'}
        </p>
      </Sheet>
    </Screen>
  )
}
