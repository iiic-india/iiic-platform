import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site/SiteFrame'

/** Pages in the consultancy register (docs/02): the organisations pages and case studies. */
export default function ConsultancyRegisterLayout({ children }: { children: ReactNode }) {
  return <SiteFrame register="consultancy">{children}</SiteFrame>
}
