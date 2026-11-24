import { after } from 'next/server'
import { createLocalReq, getPayload } from 'payload'

import { recordEventQuietly } from '@/lib/analytics/record'
import { env } from '@/lib/env'
import { actsHere } from '@/lib/messaging/deployment'
import { reportError } from '@/lib/monitoring/sentry'
import { clientKey, formEvidence, readFields, seeOther } from '@/lib/newsletter/http'
import { WindowLimit } from '@/lib/newsletter/limit'
import { confirmSignup } from '@/lib/newsletter/subscriptions'
import { isToken } from '@/lib/newsletter/tokens'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const limit = new WindowLimit(20, 10 * 60 * 1000)
const page = (state: string) => `/newsletter?state=${state}`

/**
 * The confirmation's button (docs/19 §8; D-10): only this POST confirms, so a link scanner that
 * opens the email's link confirms nothing. The token is the person's proof that the address is
 * theirs; the consent to marketing email is recorded first, with this form's evidence, then the
 * person is found or added and the entry confirmed (src/lib/newsletter/subscriptions.ts). On a
 * preview, which shares production's database, it looks nothing up and answers as for a link
 * that does not work (D-102).
 */
export async function POST(request: Request) {
  if (!actsHere(env().VERCEL_ENV)) return seeOther(request, page('invalid-link'))
  if (!limit.take(clientKey(request.headers), Date.now())) return seeOther(request, page('busy'))
  const fields = await readFields(request)
  const token = fields?.token
  if (!isToken(token)) return seeOther(request, page('invalid-link'))

  try {
    const payload = await getPayload({ config })
    const req = await createLocalReq({}, payload)
    const now = new Date()
    const result = await confirmSignup(req, token, formEvidence(request.headers), now)
    if (!result.ok) {
      return seeOther(request, page(result.error.code === 'expired' ? 'expired' : 'invalid-link'))
    }
    if (result.value.already) return seeOther(request, page('already'))
    const headers = new Headers(request.headers)
    after(() =>
      recordEventQuietly(
        { name: 'newsletter_confirmed', route: '/newsletter/confirm', register: 'default' },
        headers,
        now,
      ),
    )
    return seeOther(request, page('confirmed'))
  } catch (error) {
    console.error(
      `Newsletter confirmation failed (${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    await reportError(error, { task: 'newsletter-confirm' })
    return seeOther(request, page('confirm-failed'))
  }
}
