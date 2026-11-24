import { createLocalReq, getPayload } from 'payload'

import { verifySignedLink } from '@/lib/automations/operations/core'
import { env } from '@/lib/env'
import { actsHere } from '@/lib/messaging/deployment'
import { reportError } from '@/lib/monitoring/sentry'
import { PRIVATE_HEADERS, readFields, seeOther } from '@/lib/newsletter/http'
import { isOneClick, NEWSLETTER_PATHS, SignedLinkToken } from '@/lib/newsletter/rules'
import { unsubscribe } from '@/lib/newsletter/subscriptions'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const plain = (status: number) => new Response(null, { status, headers: PRIVATE_HEADERS })

/**
 * Unsubscribing (docs/19 §8; RFC 8058; docs/13 §5). Every promotional email's
 * `List-Unsubscribe` header points here with the signed token in the address:
 * - a POST with the body `List-Unsubscribe=One-Click` is the mail client's one-click
 *   unsubscribe: it takes the address off the list at once and answers 200 with no body;
 * - a POST from the visible unsubscribe page carries the token in the form instead, and goes on
 *   to the newsletter page that says it is done;
 * - a GET never unsubscribes (a link scanner opens links): it shows the page with the button.
 * The token is the core's signed link for `unsubscribe`, naming the subscriber. Withdrawing the
 * consent and marking the entry happen together (src/lib/newsletter/subscriptions.ts).
 * On a preview, which shares production's database, a POST looks nothing up and answers as for a
 * link that does not work (D-102).
 */
export async function GET(request: Request) {
  const token = SignedLinkToken.safeParse(new URL(request.url).searchParams.get('token'))
  if (!token.success) return seeOther(request, '/newsletter?state=invalid-link')
  return seeOther(request, NEWSLETTER_PATHS.unsubscribePage(token.data))
}

export async function POST(request: Request) {
  const fromQuery = new URL(request.url).searchParams.get('token')
  const fields = await readFields(request)
  const oneClick = fromQuery !== null && isOneClick(fields)
  const token = SignedLinkToken.safeParse(oneClick ? fromQuery : fields?.token)
  if (!token.success || !actsHere(env().VERCEL_ENV)) {
    return oneClick ? plain(400) : seeOther(request, '/newsletter?state=invalid-link')
  }

  try {
    const link = await verifySignedLink('unsubscribe', token.data)
    if (!link.ok) {
      return oneClick ? plain(400) : seeOther(request, '/newsletter?state=invalid-link')
    }
    const payload = await getPayload({ config })
    const req = await createLocalReq({}, payload)
    // An entry already removed by its owner (`not-found`) is off the list too: the same answer.
    await unsubscribe(req, link.value.subjectId, oneClick ? 'email' : 'web', new Date())
    return oneClick ? plain(200) : seeOther(request, '/newsletter?state=unsubscribed')
  } catch (error) {
    console.error(
      `Newsletter unsubscribe failed (${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    await reportError(error, { task: 'newsletter-unsubscribe' })
    return oneClick ? plain(500) : seeOther(request, '/newsletter?state=unsubscribe-failed')
  }
}
