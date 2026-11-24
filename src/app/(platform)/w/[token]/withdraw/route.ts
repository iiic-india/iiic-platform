import { createLocalReq, getPayload } from 'payload'
import { z } from 'zod'

import { verifySignedLink } from '@/lib/automations/operations/core'
import { env } from '@/lib/env'
import { actsHere } from '@/lib/messaging/deployment'
import { reportError } from '@/lib/monitoring/sentry'
import { clientKey, formEvidence, readFields, seeOther } from '@/lib/newsletter/http'
import { WindowLimit } from '@/lib/newsletter/limit'
import { SignedLinkToken } from '@/lib/newsletter/rules'
import { withdrawPurpose } from '@/lib/newsletter/withdrawals'
import { CONSENT_PURPOSES, type ConsentPurpose } from '@/lib/privacy/purposes'
import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

const limit = new WindowLimit(30, 10 * 60 * 1000)

const Purpose = z.enum(
  CONSENT_PURPOSES.map(({ value }) => value) as [ConsentPurpose, ...ConsentPurpose[]],
)

type Context = { params: Promise<{ token: string }> }

/**
 * The withdraw page's buttons (docs/19 §8; docs/08 §3). The signed link names the person; the
 * form names the purpose. Every consent of that purpose in force is withdrawn at once, channel
 * web, with this form's evidence; the ledger's hooks take reviews down and raise
 * `consent.withdrawn` (V2, N3) in the same transaction. On a preview, which shares production's
 * database, it looks nothing up and answers as for a link that does not work (D-102).
 */
export async function POST(request: Request, context: Context) {
  const { token } = await context.params
  const shape = SignedLinkToken.safeParse(token)
  if (!shape.success || !actsHere(env().VERCEL_ENV)) {
    return seeOther(request, '/newsletter?state=invalid-link')
  }
  const back = (state: string) => seeOther(request, `/w/${shape.data}?state=${state}`)
  if (!limit.take(clientKey(request.headers), Date.now())) return back('failed')

  const purpose = Purpose.safeParse((await readFields(request))?.purpose)
  if (!purpose.success) return back('failed')
  try {
    const link = await verifySignedLink('withdraw', shape.data)
    if (!link.ok) return back('failed')
    const payload = await getPayload({ config })
    const req = await createLocalReq({}, payload)
    const evidence = formEvidence(request.headers)
    await withdrawPurpose(
      req,
      {
        personId: link.value.subjectId,
        purpose: purpose.data,
        channel: 'web',
        evidence: { form: 'Withdraw page', ...evidence },
      },
      new Date(),
    )
    return back('done')
  } catch (error) {
    console.error(`A withdrawal failed (${error instanceof Error ? error.name : 'unknown error'}).`)
    await reportError(error, { task: 'consent-withdraw' })
    return back('failed')
  }
}
