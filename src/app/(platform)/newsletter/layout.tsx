import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site/SiteFrame'

/** The newsletter's pages, in the default register (paper), like the Journal's signup. */
export default function NewsletterLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>
}
