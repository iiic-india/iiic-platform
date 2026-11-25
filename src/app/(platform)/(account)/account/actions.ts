'use server'

import { redirect } from 'next/navigation'

import { changeOwnBooking } from '@/lib/accounts/bookings'
import type { ManageOwnBookingError } from '@/lib/accounts/contract'
import { accountRequest, openMyIiic, signOut } from '@/lib/accounts/scope'
import { reportError } from '@/lib/monitoring/sentry'

/**
 * My IIIC's server actions (docs/20 §7.2): sign out, move a booking, cancel a booking. Each one
 * checks the flag and the session before it reads the form (CLAUDE.md #6), and answers with a
 * page: the forms post without JavaScript and come back to the booking with its outcome, or to
 * the form with what went wrong (docs/12 §4). A fault is logged and reported by its name only,
 * never with the form's words (docs/12 §6, Logs), and the person reads that nothing was changed.
 */

/** "Sign out" on every My IIIC page: ends this session and clears its cookies (builder A's). */
export async function signOutAction(): Promise<void> {
  await signOut()
  redirect('/')
}

type Changed = Awaited<ReturnType<typeof changeOwnBooking>>

async function safely(
  task: string,
  run: () => Promise<Changed>,
): Promise<Changed | { ok: false; error: { code: 'failed' } }> {
  try {
    return await run()
  } catch (error) {
    console.error(
      `My IIIC's ${task} failed (${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    void reportError(error, { task: `account-${task}` })
    return { ok: false, error: { code: 'failed' } }
  }
}

const text = (form: FormData, name: string): string => {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

const pageOf = (reference: string) => `/account/bookings/${encodeURIComponent(reference)}`

const problemOf = (error: ManageOwnBookingError | { code: 'failed' }) => error.code

export async function rescheduleOwnAction(form: FormData): Promise<void> {
  const account = await openMyIiic('/account/bookings')
  const reference = text(form, 'reference')
  const startsAt = text(form, 'startsAt')
  if (!startsAt) redirect(`${pageOf(reference)}?step=reschedule&problem=choose-time`)
  const req = await accountRequest(account)
  const changed = await safely('reschedule', () =>
    changeOwnBooking(req, account, { kind: 'reschedule', reference, startsAt }, new Date()),
  )
  if (!changed.ok) {
    redirect(`${pageOf(reference)}?step=reschedule&problem=${problemOf(changed.error)}`)
  }
  redirect(`${pageOf(changed.value.booking.reference)}?done=moved`)
}

export async function cancelOwnAction(form: FormData): Promise<void> {
  const account = await openMyIiic('/account/bookings')
  const reference = text(form, 'reference')
  const reason = text(form, 'reason').trim()
  const req = await accountRequest(account)
  const changed = await safely('cancellation', () =>
    changeOwnBooking(
      req,
      account,
      { kind: 'cancel', reference, ...(reason ? { reason } : {}) },
      new Date(),
    ),
  )
  if (!changed.ok) redirect(`${pageOf(reference)}?step=cancel&problem=${problemOf(changed.error)}`)
  const refund = changed.value.cancelled
  const refundState = refund?.refunded ? (refund.awaitsOwner ? 'owner' : 'sent') : null
  redirect(`${pageOf(reference)}?done=cancelled${refundState ? `&refund=${refundState}` : ''}`)
}
