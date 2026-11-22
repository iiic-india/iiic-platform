import type { ReactNode } from 'react'

import { registerOfReference } from '@/components/booking/registers'
import { SiteFrame } from '@/components/site/SiteFrame'

/** The confirmation, in the register of the booking's kind, read from its reference (docs/02). */
export default async function ConfirmedLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ ref: string }>
}) {
  const { ref } = await params
  return <SiteFrame register={registerOfReference(ref)}>{children}</SiteFrame>
}
