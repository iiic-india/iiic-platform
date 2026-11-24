import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { Scope } from '@/components/blocks/Scope'
import { PAY_COPY } from '@/components/booking/copy'
import { PayStep } from '@/components/booking/PayStep'
import { typeOfReference } from '@/components/booking/registers'
import { formatRupees } from '@/lib/bookingFlow/review'
import { bookingForThisBrowser, flowRequest } from '@/lib/bookingFlow/server'
import { readFlags } from '@/lib/settings/source'

export const metadata: Metadata = {
  title: PAY_COPY.heading,
  robots: { index: false, follow: false },
}

/**
 * /book/pay/[ref]: step 4, payment at booking (docs/03 F3; docs/16 §5), on a page of its own so
 * that the gateway's origins are allowed here and nowhere else (docs/12 §5). Only the browser
 * that placed the hold sees it (the booking cookie); the total is the one the server copied into
 * the booking at step 3, shown only while prices are published (D-21).
 */
export default async function PayPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params
  const type = typeOfReference(ref)
  const req = await flowRequest()
  const booking = type ? await bookingForThisBrowser(req, ref) : null
  const session = type === 'session'
  if (booking && booking.status === 'confirmed') redirect(`/book/confirmed/${ref}`)
  const flags = await readFlags(req.payload)
  const total = booking?.price?.totalPaise ?? 0
  const amount = flags.pricesPublic && total > 0 ? formatRupees(total) : null
  // A checkout opened earlier may still be paid after the hold ran out (docs/16 §3).
  const paymentOpened = booking
    ? (
        await req.payload.count({
          collection: 'payments',
          where: { booking: { equals: booking.id } },
          overrideAccess: true,
          req,
        })
      ).totalDocs > 0
    : false
  return (
    <>
      <section className="iiic-section">
        <div className="iiic-section-head">
          <div>
            <h1 className="iiic-marked">{PAY_COPY.heading}</h1>
          </div>
        </div>
        {booking ? (
          <PayStep
            reference={ref}
            holdExpiresAt={booking.holdExpiresAt ?? null}
            amount={amount}
            startAgainHref={`/book/${booking.type}`}
            paymentOpened={paymentOpened}
          />
        ) : (
          <p>{PAY_COPY.notYours}</p>
        )}
      </section>
      {session ? <Scope /> : null}
    </>
  )
}
