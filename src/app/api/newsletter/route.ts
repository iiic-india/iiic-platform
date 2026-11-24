import { createLocalReq, getPayload } from 'payload'

import { env } from '@/lib/env'
import { actsHere } from '@/lib/messaging/deployment'
import { reportError } from '@/lib/monitoring/sentry'
import { clientKey, json, readFields, seeOther, wantsJson } from '@/lib/newsletter/http'
import { WindowLimit } from '@/lib/newsletter/limit'
import { SignupInput } from '@/lib/newsletter/rules'
import { signUp } from '@/lib/newsletter/subscriptions'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

/** Ten signups from one address in ten minutes, then a pause (docs/12 §6). */
const limit = new WindowLimit(10, 10 * 60 * 1000)

const PAGE = '/newsletter'
const page = (state: string) => `${PAGE}?state=${state}`

/**
 * The newsletter signup (docs/19 §8; D-10): a public form, so no user is asked for. The body is
 * checked with Zod; a burst from one address is refused; a filled trap field is answered as a
 * success and nothing is done. Every accepted address gets the same answer whether or not it is
 * on the list, so the form tells nobody who subscribes. Nothing promotional is stored here: the
 * pending entry holds the address, the notice and the link's hash until the person confirms.
 * A plain form post is sent on to the page with its state; a script asking for JSON gets JSON.
 */
export async function POST(request: Request) {
  const asJson = wantsJson(request)
  const answer = (status: number, state: string) =>
    asJson ? json(status, { state }) : seeOther(request, page(state))

  if (!limit.take(clientKey(request.headers), Date.now())) return answer(429, 'busy')
  const fields = await readFields(request)
  const input = SignupInput.safeParse(fields ?? {})
  if (!input.success) return answer(400, 'invalid')
  if (input.data.website) return answer(202, 'sent')
  // A preview shares production's database: a signup there would store an address and queue a
  // real confirmation email from production's runner. It stores nothing (src/lib/messaging/
  // deployment.ts), and the page says signing up is closed.
  if (!actsHere(env().VERCEL_ENV)) return answer(503, 'closed')

  try {
    const payload = await getPayload({ config })
    const req = await createLocalReq({}, payload)
    const result = await signUp(
      req,
      { email: input.data.email, source: input.data.source },
      new Date(),
    )
    if (!result.ok) return answer(503, 'closed')
    return answer(202, 'sent')
  } catch (error) {
    console.error(
      `Newsletter signup failed (${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    await reportError(error, { task: 'newsletter-signup' })
    return answer(500, 'failed')
  }
}
