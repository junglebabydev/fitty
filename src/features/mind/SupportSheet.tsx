// Support sheet. Hard-coded and offline by design: no network call, no AI, no database read
// happens on this path, so it opens instantly even with no connection (docs/DESIGN.md §6 Safety).
import type { ReactNode } from 'react'
import { ChevronRight, Globe, MessageCircle, Phone, Siren } from 'lucide-react'
import { Sheet } from '../../components'

export interface SupportSheetProps {
  open: boolean
  onClose: () => void
}

interface SupportLink {
  href: string
  icon: ReactNode
  title: string
  detail: string
  ariaLabel: string
  external?: boolean
}

interface SupportGroup {
  name: string
  about: string
  links: SupportLink[]
}

const ICON = 20

const SUPPORT_GROUPS: SupportGroup[] = [
  {
    name: 'national mindline 1771',
    about: 'Free and confidential, any time of day. Trained counsellors.',
    links: [
      { href: 'tel:1771', icon: <Phone size={ICON} />, title: 'Call 1771', detail: '24 hours, every day', ariaLabel: 'Call national mindline on 1771' },
      { href: 'https://wa.me/6566691771', icon: <MessageCircle size={ICON} />, title: 'WhatsApp 6669 1771', detail: 'Text instead of talking', ariaLabel: 'Message national mindline on WhatsApp, 6669 1771', external: true },
      { href: 'https://mindline.sg/fsmh', icon: <Globe size={ICON} />, title: 'Webchat', detail: 'mindline.sg/fsmh', ariaLabel: 'Open the national mindline webchat', external: true },
    ],
  },
  {
    name: 'Samaritans of Singapore (SOS)',
    about: 'Someone to listen when things feel too heavy to carry alone.',
    links: [
      { href: 'tel:1767', icon: <Phone size={ICON} />, title: 'Call 1767', detail: '24-hour hotline', ariaLabel: 'Call the Samaritans of Singapore 24-hour hotline on 1767' },
      { href: 'https://wa.me/6591511767', icon: <MessageCircle size={ICON} />, title: 'CareText 9151 1767', detail: 'WhatsApp text support', ariaLabel: 'Message SOS CareText on WhatsApp, 9151 1767', external: true },
    ],
  },
]

function Row({ link }: { link: SupportLink }) {
  return (
    <a
      href={link.href}
      aria-label={link.ariaLabel}
      {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="press flex min-h-[64px] items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-app no-underline"
    >
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-pillar-soft text-pillar" aria-hidden>
        {link.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-tight">{link.title}</span>
        <span className="mt-0.5 block text-sm text-muted">{link.detail}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
    </a>
  )
}

export function SupportSheet({ open, onClose }: SupportSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Support">
      <div data-pillar="mind" className="flex flex-col gap-6 pb-2">
        <p className="voice m-0 text-xl text-app">You do not have to sort this out on your own. These people are there to listen.</p>

        {SUPPORT_GROUPS.map((g) => (
          <section key={g.name} aria-label={g.name} className="flex flex-col gap-2">
            <h3 className="eyebrow m-0 text-pillar">{g.name}</h3>
            <p className="m-0 text-sm text-muted">{g.about}</p>
            <div className="mt-1 flex flex-col gap-2">
              {g.links.map((l) => <Row key={l.href} link={l} />)}
            </div>
          </section>
        ))}

        <section aria-label="Emergency" className="flex flex-col gap-2">
          <h3 className="eyebrow m-0 text-muted">Emergency</h3>
          <p className="m-0 text-base text-app">If you are in immediate danger, call 995 or go to A&amp;E.</p>
          <a
            href="tel:995"
            aria-label="Call 995 for emergency services"
            className="press flex min-h-[64px] items-center gap-3 rounded-2xl border border-line-strong bg-surface-2 px-4 py-3 text-app no-underline"
          >
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-3 text-stop" aria-hidden>
              <Siren size={ICON} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold leading-tight">Call 995</span>
              <span className="mt-0.5 block text-sm text-muted">Ambulance and emergency services</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
          </a>
        </section>

        <p className="m-0 text-sm text-muted">This app is not a medical service. It cannot see or respond to what you write here.</p>
      </div>
    </Sheet>
  )
}
