import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site/SiteFrame'

/**
 * Pages in the counselling register (docs/02). They stay plain: no experience devices, only
 * the text, the scope statement and the crisis numbers (docs/11; docs/08 §7).
 */
export default function CounsellingRegisterLayout({ children }: { children: ReactNode }) {
  return <SiteFrame register="counselling">{children}</SiteFrame>
}
