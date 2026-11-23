'use client'

import { useParams } from 'next/navigation'

import { Scope } from '@/components/blocks/Scope'
import { ServerError } from '@/components/site/ServerError'

import { typeOfReference } from './registers'

/**
 * The 500 on a booking's own pages (the payment step, the confirmation), inside the layout's
 * frame: a counselling booking's carries the scope statement and the crisis numbers, as every
 * counselling surface does (docs/08 §7; docs/11 §5.2).
 */
export function BookingError({ error }: { error: Error & { digest?: string } }) {
  const params = useParams<{ ref?: string }>()
  const session = typeOfReference(String(params?.ref ?? '')) === 'session'
  return <ServerError reference={error.digest}>{session ? <Scope /> : null}</ServerError>
}
