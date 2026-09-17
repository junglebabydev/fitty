import { useAIStatus, type AIStatus } from '../features/ai/config'
import { cx } from '../lib/util'

export interface AIStatusChipProps {
  /** Usually navigates to /settings#ai. Without it the chip is a plain status label. */
  onClick?: () => void
}

type ChipState = 'checking' | 'claude' | 'key' | 'signin' | 'offline' | 'demo'

const LABEL: Record<ChipState, string> = {
  checking: 'Checking…',
  claude: 'Claude connected',
  key: 'AI key connected',
  signin: 'Sign in on your Mac',
  offline: 'AI offline',
  demo: 'Demo mode',
}

const DOT: Record<ChipState, string> = {
  checking: 'bg-faint anim-pulse-soft',
  claude: 'bg-ok',
  key: 'bg-ok',
  signin: 'bg-warn',
  offline: 'bg-warn',
  demo: 'bg-faint',
}

export function aiChipState(s: AIStatus): ChipState {
  if (s.checking && !s.connected) return 'checking'
  if (s.connected) return s.active === 'claude-code' ? 'claude' : 'key'
  if (s.bridge?.auth === 'signed_out' && s.mode !== 'mock' && s.mode !== 'anthropic') return 'signin'
  if (s.mode === 'claude-code' || (s.mode === 'anthropic' && s.active === 'anthropic')) return 'offline'
  return 'demo'
}

/** Compact pill: status dot + short words. The words carry the meaning; the dot only reinforces it. */
export function AIStatusChip({ onClick }: AIStatusChipProps) {
  const status = useAIStatus()
  const state = aiChipState(status)
  const pill = (
    <span className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface-2 px-3 text-[13px] font-medium text-app">
      <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', DOT[state])} />
      {LABEL[state]}
    </span>
  )
  if (!onClick) return <span role="status" title={status.message} className="inline-flex">{pill}</span>
  return (
    <button type="button" onClick={onClick} title={status.message} aria-label={`AI: ${LABEL[state]}. Open AI settings`} className="press inline-flex min-h-11 items-center">
      {pill}
    </button>
  )
}
