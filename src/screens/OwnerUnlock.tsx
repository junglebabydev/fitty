// Hosted site, fresh phone: load the owner's profile from the Worker (OWNER_PROFILE secret) with the PIN instead of
// running onboarding. Shown by OnboardingGate; "Set up from scratch" falls through to the normal wizard.
import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { Button, Field, TextInput } from '../components'
import { unlockOwnerProfile } from '../features/settings/ownerBootstrap'

export default function OwnerUnlockScreen({ onSkip }: { onSkip: () => void }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    // On success the profile write re-renders OnboardingGate, which then shows the app.
    const problem = await unlockOwnerProfile(pin)
    setBusy(false)
    if (problem) setError(problem)
  }

  return (
    <div className="flex-1 flex flex-col justify-center gap-6 px-6 pt-safe pb-safe">
      <div className="flex flex-col gap-2">
        <KeyRound size={26} className="text-muted" aria-hidden />
        <h1 className="text-[26px] font-semibold leading-tight">Welcome back</h1>
        <p className="text-[15px] leading-snug text-muted">Enter your PIN to load your profile from this site's server.</p>
      </div>
      <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        <Field label="PIN" htmlFor="owner-pin" error={error ?? undefined}>
          <TextInput
            id="owner-pin"
            type="password"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(null) }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            invalid={!!error}
          />
        </Field>
        <Button type="submit" full size="lg" loading={busy} disabled={!pin.trim() || busy}>Load my profile</Button>
      </form>
      <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy}>Set up from scratch instead</Button>
    </div>
  )
}
