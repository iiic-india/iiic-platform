import type { ReactNode } from 'react'

import { registerOfType } from '@/components/booking/registers'
import { SiteFrame } from '@/components/site/SiteFrame'
import { findByManageToken } from '@/lib/booking/api'
import { flowRequest } from '@/lib/bookingFlow/server'

/**
 * The manage page, in the register of the booking its link opens (docs/02: "from type"); the
 * default register when the link opens none.
 */
export default async function ManageLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const booking = await findByManageToken(await flowRequest(), token, new Date())
  return <SiteFrame register={registerOfType(booking?.type)}>{children}</SiteFrame>
}
