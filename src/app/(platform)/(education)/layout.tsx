import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site/SiteFrame'

/** Pages in the education register (docs/02): the course, and later the Journal. */
export default function EducationRegisterLayout({ children }: { children: ReactNode }) {
  return <SiteFrame register="education">{children}</SiteFrame>
}
