import { ownBookingInvite } from '@/lib/accounts/bookings'
import type { AccountSession } from '@/lib/accounts/contract'
import { accountRequest, openMyIiicRoute, PRIVATE_FILE_HEADERS } from '@/lib/accounts/scope'
import { env } from '@/lib/env'
import { answeringFaults } from '@/lib/monitoring/routeFaults'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const send = answeringFaults(
  'Sending a My IIIC calendar invite',
  async (account: AccountSession, reference: string) => {
    const invite = await ownBookingInvite(
      await accountRequest(account),
      account,
      reference,
      env().siteUrl,
    )
    if (!invite) return new Response('Not found', { status: 404, headers: PRIVATE_FILE_HEADERS })
    return new Response(invite.ics, {
      status: 200,
      headers: {
        ...PRIVATE_FILE_HEADERS,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${invite.reference}.ics"`,
      },
    })
  },
)

/**
 * GET /account/bookings/[ref]/invite.ics (docs/20 §5): "Add to your calendar" for a confirmed
 * booking of the account's with a time, the invite its confirmation carries (M3's builder,
 * src/lib/calendar/bookingInvite.ts), `private, no-store`. The flag and the session come first;
 * any other booking is a 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const account = await openMyIiicRoute('/account/bookings')
  if (account instanceof Response) return account
  return send(account, (await params).ref)
}
