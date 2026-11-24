import { randomBytes } from 'node:crypto'

import type { Metadata } from 'next'

import { Scope } from '@/components/blocks/Scope'
import { loadCatalogue } from '@/lib/bookingFlow/catalogue'
import type { FlowType } from '@/lib/bookingFlow/details'
import { countStep, flowRequest } from '@/lib/bookingFlow/server'
import { turnstileKeys } from '@/lib/enquiryForms/turnstile'
import { env } from '@/lib/env'
import { istDay } from '@/lib/time/ist'

import { BookingFlow } from './BookingFlow'
import { PAGE_TITLES } from './copy'

export function bookingMetadata(type: FlowType): Metadata {
  return { title: PAGE_TITLES[type], robots: { index: false, follow: false } }
}

/**
 * The booking flow's page for one kind of booking (docs/02 `/book/[type]`; docs/03 F3), drawn in
 * the register its route group sets: counselling for a session, consultancy for a call,
 * education for an info session. Everything the steps offer is read on the server; the page
 * makes this visit's checkout key, so a double submit books once (docs/16 §6). A counselling
 * booking carries the scope statement and the crisis numbers (docs/08 §7), and no experience
 * device (docs/11).
 */
export async function BookingPage({ type }: { type: FlowType }) {
  const catalogue = await loadCatalogue(await flowRequest(), type)
  const checkoutKey = randomBytes(24).toString('base64url')
  await countStep('booking_started', type)
  return (
    <>
      <section className="iiic-section">
        <div className="iiic-section-head">
          <div>
            <h1 className="iiic-marked">{PAGE_TITLES[type]}</h1>
          </div>
        </div>
      </section>
      <BookingFlow
        type={type}
        catalogue={catalogue}
        checkoutKey={checkoutKey}
        today={istDay(new Date())}
        turnstileSiteKey={turnstileKeys(env())?.siteKey ?? null}
      />
      {type === 'session' ? <Scope /> : null}
    </>
  )
}
