import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Database, FileJson, HardDrive, Lock, Trash2, TriangleAlert } from 'lucide-react'
import { Button, Card, Field, HeroNumber, ProgressBar, Screen, Segmented, Sheet, Skeleton, StatTile, StatusPill, TextInput } from '../components'
import { db } from '../db/database'
import { deleteAllData, tableCounts } from '../db/repositories'
import { useDbVersion, useQuery, useToast } from '../hooks'
import { buildJsonExport, buildSqliteBlob, downloadBlob, exportFilename, fmtBytes, sortTables, storageEstimate, type StorageEstimate } from '../features/settings/files'
import { DEFAULT_VOICE_RETENTION_DAYS, KEYS, VOICE_RETENTION_OPTIONS } from '../features/settings/keys'
import { ControlRow, Group, GroupBlock, GroupText, Row, StatusLine, Toggle } from '../features/settings/SettingsUI'
import { useSetting } from '../features/settings/useSetting'

const DELETE_WORD = 'DELETE'
/** Tables shown before "Show all". sortTables puts personal data first. */
const TOP_TABLES = 6

export default function DataSettingsScreen() {
  const toast = useToast()
  const version = useDbVersion()
  const counts = useQuery(() => tableCounts(), [])
  const persistFailed = useQuery(() => db.persistFailed, [])
  const rows = sortTables(counts)
  const totalRows = rows.reduce((a, r) => a + r.count, 0)

  const [estimate, setEstimate] = useState<StorageEstimate | null | 'loading'>('loading')
  const [keepPhotos, setKeepPhotos] = useSetting<boolean>(KEYS.keepMealPhotos, true)
  const [voiceDays, setVoiceDays] = useSetting<number>(KEYS.voiceRetentionDays, DEFAULT_VOICE_RETENTION_DAYS)
  const [exporting, setExporting] = useState<'json' | 'db' | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Re-estimate whenever the database changes (persist runs ~250 ms after a write).
  useEffect(() => {
    let alive = true
    const t = window.setTimeout(() => {
      storageEstimate().then((r) => alive && setEstimate(r))
    }, 400)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [version])

  const doExport = async (kind: 'json' | 'db') => {
    setExporting(kind)
    try {
      const blob = kind === 'json' ? new Blob([buildJsonExport()], { type: 'application/json' }) : buildSqliteBlob()
      const name = exportFilename(kind)
      const outcome = await downloadBlob(name, blob)
      if (outcome === 'failed') toast.show('Could not hand the file to the browser', 'error')
      else toast.show(`${outcome === 'shared' ? 'Shared' : 'Saved'} ${name} (${fmtBytes(blob.size)})`, 'success')
    } catch (e) {
      toast.show(e instanceof Error && e.message ? e.message : 'Export failed', 'error')
    } finally {
      setExporting(null)
    }
  }

  const closeDelete = () => {
    if (deleting) return
    setDeleteOpen(false)
    setConfirmText('')
  }

  const doDelete = async () => {
    if (confirmText.trim().toUpperCase() !== DELETE_WORD) return
    setDeleting(true)
    try {
      await deleteAllData()
      // deleteAllData left a fresh database holding only the seed.skipDemo marker; reload so boot skips the demo and lands on setup.
      window.location.replace('/onboarding')
    } catch (e) {
      setDeleting(false)
      toast.show(e instanceof Error && e.message ? e.message : 'Delete failed', 'error')
    }
  }

  const usage = estimate !== 'loading' && estimate ? estimate.usageBytes : null
  const quota = estimate !== 'loading' && estimate ? estimate.quotaBytes : null
  const persisted = estimate !== 'loading' && estimate ? estimate.persisted : null
  // fmtBytes gives "2.3 MB": split so the numeral can be the hero and the unit sits beside it.
  const [usedValue, usedUnit] = usage != null ? fmtBytes(usage).split(' ') : ['—', undefined]

  const filled = rows.filter((r) => r.count > 0)
  const visible = showAll ? rows : filled.slice(0, TOP_TABLES)
  const hiddenCount = rows.length - visible.length
  const confirmed = confirmText.trim().toUpperCase() === DELETE_WORD

  return (
    <Screen title="Data & storage" pillar="neutral" back="/settings" backLabel="Settings">
      <p className="voice text-xl anim-rise">One copy of your data exists, and it lives on this phone.</p>

      <Card eyebrow="On this device" className="mt-5" action={persisted !== null ? <StatusPill tone="neutral" icon={<Lock size={12} />} size="sm">{persisted ? 'Persistent' : 'Best effort'}</StatusPill> : undefined}>
        {estimate === 'loading' ? (
          <div role="status" aria-label="Measuring storage">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-2 w-full mt-4" />
          </div>
        ) : (
          <>
            <HeroNumber value={usedValue} unit={usedUnit} size="lg" sub={estimate ? (quota != null ? `used of ${fmtBytes(quota)} this browser allows` : 'used by the database and cached assets') : 'Storage estimate is not available in this browser'} />
            {usage != null && quota != null && quota > 0 && <ProgressBar value={usage} max={quota} height="sm" className="mt-3" />}
          </>
        )}
        {persistFailed && (
          <div className="rounded-xl border border-line-strong bg-surface-2 px-3.5 py-3 mt-4" role="alert">
            <StatusLine tone="stop" icon={<TriangleAlert size={18} />}>
              <span className="font-semibold">The last save failed. </span>
              <span className="text-muted">Storage may be full. Recent changes exist only in memory until a save succeeds, so export a copy now.</span>
            </StatusLine>
          </div>
        )}
        <p className="text-[13px] text-muted mt-3 leading-snug">
          {totalRows.toLocaleString('en-SG')} rows across {rows.length} tables. Nothing is synced or uploaded; the exports below are the only other copies that can ever exist.
        </p>
      </Card>

      <section className="pt-6" aria-labelledby="ds-stored">
        <h2 id="ds-stored" className="eyebrow text-muted px-1 pb-2">
          What's stored
        </h2>
        {visible.length === 0 ? (
          <Card>
            <p className="voice text-lg text-muted">Nothing yet. Records appear here as you log.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visible.map((r) => (
              <StatTile key={r.name} label={r.label} value={r.count.toLocaleString('en-SG')} sub={r.count === 1 ? 'row' : 'rows'} />
            ))}
          </div>
        )}
        {(hiddenCount > 0 || showAll) && rows.length > TOP_TABLES && (
          <Button variant="ghost" size="md" full className="mt-2" icon={showAll ? <ChevronUp size={18} /> : <ChevronDown size={18} />} onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? 'Show fewer' : `Show all ${rows.length} tables`}
          </Button>
        )}
      </section>

      <section className="pt-6" aria-labelledby="ds-export">
        <h2 id="ds-export" className="eyebrow text-muted px-1 pb-2">
          Export
        </h2>
        <Card>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" full icon={<FileJson size={20} />} loading={exporting === 'json'} disabled={exporting !== null} onClick={() => void doExport('json')}>
              JSON
            </Button>
            <Button variant="secondary" size="lg" full icon={<Database size={20} />} loading={exporting === 'db'} disabled={exporting !== null} onClick={() => void doExport('db')}>
              SQLite
            </Button>
          </div>
          <dl className="mt-4 flex flex-col gap-2 text-[14px] leading-snug">
            <div>
              <dt className="inline font-semibold">JSON. </dt>
              <dd className="inline text-muted">Every table as readable text. The API key is redacted.</dd>
            </div>
            <div>
              <dt className="inline font-semibold">SQLite. </dt>
              <dd className="inline text-muted">The whole database as a .db file. API keys and the bridge PIN are left out; it still holds all your health data, so store it somewhere private.</dd>
            </div>
          </dl>
          <p className="text-[13px] text-muted mt-3 leading-snug">Exports are files handed to the browser or share sheet; nothing is uploaded. Progress and meal photos are referenced by URI and are not embedded.</p>
        </Card>
      </section>

      <Group title="Media retention" footer="Voice transcripts and meal photos are the only media the app keeps. Progress photos always stay local and are never sent.">
        <ControlRow
          icon={<HardDrive size={18} />}
          title="Keep meal photos"
          subtitle="Off = discard the photo once the meal is saved"
          control={<Toggle checked={keepPhotos} onChange={setKeepPhotos} label="Keep meal photos" />}
        />
        <GroupBlock label="Keep voice transcripts for" hint="Older transcripts are pruned automatically.">
          <Segmented options={VOICE_RETENTION_OPTIONS} value={voiceDays} onChange={setVoiceDays} size="sm" label="Voice retention" />
        </GroupBlock>
      </Group>

      <Group title="Danger zone">
        <Row
          icon={<Trash2 size={18} className="text-stop" />}
          title={<span className="text-stop font-medium">Delete all data</span>}
          subtitle="Wipes the local database and returns to setup. Asks you to type DELETE first."
          chevron
          onClick={() => setDeleteOpen(true)}
        />
        <GroupText>There is no account and no server copy. Once deleted, the only way back is an export you saved earlier.</GroupText>
      </Group>

      <Sheet
        open={deleteOpen}
        onClose={closeDelete}
        title="Delete all data?"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={closeDelete} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" full loading={deleting} disabled={!confirmed} onClick={() => void doDelete()} icon={<Trash2 size={18} />}>
              Delete everything
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="rounded-xl border border-line-strong bg-surface-2 px-3.5 py-3">
            <StatusLine tone="stop" icon={<TriangleAlert size={20} />}>
              <span className="font-semibold">This cannot be undone. </span>
              It permanently removes {totalRows.toLocaleString('en-SG')} rows: profile, goals, every workout and set, meals, sleep, weights, mood and journal, coach history, settings and the API key. The app will restart at setup.
            </StatusLine>
          </div>
          <Button variant="outline" full icon={<FileJson size={18} />} loading={exporting === 'json'} disabled={exporting !== null || deleting} onClick={() => void doExport('json')}>
            Export a JSON copy first
          </Button>
          <Field label={`Type ${DELETE_WORD} to confirm`} htmlFor="delete-confirm" hint={confirmed ? 'Confirmed. The delete button is now active.' : undefined}>
            <TextInput
              id="delete-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.currentTarget.value)}
              placeholder={DELETE_WORD}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={deleting}
            />
          </Field>
        </div>
      </Sheet>
    </Screen>
  )
}
