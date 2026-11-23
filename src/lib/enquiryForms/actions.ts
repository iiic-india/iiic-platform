'use server'

import { headers } from 'next/headers'
import { after } from 'next/server'
import { createLocalReq, getPayload } from 'payload'

import { recordEventQuietly } from '@/lib/analytics/record'
import { clientAddress } from '@/lib/analytics/session'
import { env } from '@/lib/env'
import { reportError } from '@/lib/monitoring/sentry'
import config from '@payload-config'

import { recentEnquiries } from './limits'
import { registerOf } from './register'
import { enquiryNotice } from './setup'
import type { EnquiryFormState } from './state'
import type { EnquiryFormKind } from './strings'
import { submitEnquiry } from './submit'
import { siteverify, turnstileKeys } from './turnstile'
import { receiveEnquiry } from './wiring'

/**
 * The two public forms' server actions (docs/17 §6): typed server functions, not the
 * form-builder plugin (OS-5). Each works without JavaScript, as a plain POST the page answers
 * with the form's next state, and with it, in place. A visitor needs no account, so there is no
 * user or role to check; what guards these is in submitEnquiry (src/lib/enquiryForms/submit.ts):
 * the trap, the timing, Turnstile where it is on, the rate limits and the consent in force.
 */

async function send(
  kind: EnquiryFormKind,
  previous: EnquiryFormState,
  form: FormData,
): Promise<EnquiryFormState> {
  const request = await headers()
  const payload = await getPayload({ config })
  const settings = env()
  const keys = turnstileKeys(settings)
  const host = request.get('x-forwarded-host') ?? request.get('host')
  const proto = request.get('x-forwarded-proto') ?? 'https'
  const own = new Set([...settings.allowedOrigins, ...(host ? [`${proto}://${host}`] : [])])
  const now = new Date()
  return submitEnquiry(kind, previous, form, {
    now,
    secrets: [settings.PAYLOAD_SECRET, settings.PAYLOAD_SECRET_PREVIOUS].filter(
      (secret): secret is string => Boolean(secret),
    ),
    address: clientAddress(request) || null,
    userAgent: request.get('user-agent'),
    referer: request.get('referer'),
    ownOrigin: (origin) => own.has(origin),
    turnstile: keys ? siteverify(keys.secretKey) : null,
    recent: recentEnquiries(payload),
    noticeInForce: () => enquiryNotice(payload, now),
    receive: async (input) => receiveEnquiry(await createLocalReq({}, payload), input),
    recordSubmitted: (page) =>
      after(() =>
        recordEventQuietly(
          { name: 'request_submitted', route: page, register: registerOf(page) },
          request,
          now,
        ),
      ),
    reportFault: (error) => {
      console.error(
        `An enquiry form was not received (${error instanceof Error ? error.name : 'unknown error'}).`,
      )
      void reportError(error, { task: 'enquiry-form' })
    },
  })
}

/** The Team Map request (docs/03 F5). */
export async function sendTeamMapRequest(
  previous: EnquiryFormState,
  form: FormData,
): Promise<EnquiryFormState> {
  return send('teamMap', previous, form)
}

/** The partnership enquiry (docs/03 F12). */
export async function sendPartnershipEnquiry(
  previous: EnquiryFormState,
  form: FormData,
): Promise<EnquiryFormState> {
  return send('partnership', previous, form)
}
