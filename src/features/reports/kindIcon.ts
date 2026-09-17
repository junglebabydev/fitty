import { Activity, Droplets, FileText, ScanLine, Stethoscope, type LucideIcon } from 'lucide-react'
import type { ReportKind } from '../../domain/types'

export const KIND_ICON: Record<ReportKind, LucideIcon> = {
  blood: Droplets,
  body_composition: Activity,
  clinical_note: Stethoscope,
  imaging: ScanLine,
  other: FileText,
}
