import type { ReactNode } from 'react'

import { SiteFrame } from '@/components/site/SiteFrame'

/** Pages in the default register (paper). The door pages get their own groups in M2. */
export default function DefaultRegisterLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>
}
