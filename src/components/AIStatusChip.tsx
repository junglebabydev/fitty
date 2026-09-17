import { useAIStatus, type AIStatus } from '../features/ai/config'
import { cx } from '../lib/util'

export interface AIStatusChipProps {
  /** Usually navigates to /settings#ai. Without it the chip is a plain status label. */
  onClick?: () => void
}

type ChipState = 'checking' | 'claude' | 'cloud' | 'key' | 'signin' | 'setup' | 'offline' | 'demo'

const LABEL: Record<ChipState, string> = {
  checking: 'Checking…',
  claude: 'Claude connected',
  cloud: 'AI connected',
  key: 'AI key connected',
  signin: 'Sign in on your Mac',
  setup: 'Connect AI',
  offline: 'AI offline',
  demo: 'Demo mode',
}

const DOT: Record<ChipState, string> = {
  checking: 'bg-faint anim-pulse-soft',
  claude: 'bg-ok',
  cloud: 'bg-ok',
  key: 'bg-ok',
  signin: 'bg-warn',
  setup: 'bg-faint',
  offline: 'bg-warn',
  demo: 'bg-faint',
}

export function aiChipState(s: AIStatus): ChipState {
  if (s.checking && !s.connected) return 'checking'
  const hosted = s.host === 'cloud'
  if (s.connected) return s.active === 'claude-code' ? (hosted ? 'cloud' : 'claude') : 'key'
  // "Sign in on your Mac" only makes sense for the local Claude Code bridge; a hosted site needs a key instead.
  if (hosted && s.mode !== 'mock') return 'setup'
  if (s.bridge?.auth === 'signed_out' && s.mode !== 'mock' && s.mode !== 'anthropic' && s.mode !== 'gemini') return 'signin'
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
