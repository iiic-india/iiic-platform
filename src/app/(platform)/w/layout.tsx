import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site/SiteFrame'

/** The withdraw page, in the default register (paper). */
export default function WithdrawLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>
}
