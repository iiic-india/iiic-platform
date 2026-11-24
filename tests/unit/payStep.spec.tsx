// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { PAY_COPY } from '@/components/booking/copy'
import { PayStep } from '@/components/booking/PayStep'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => undefined }) }))
vi.mock('@/lib/bookingFlow/actions', () => ({
  bookingStateAction: vi.fn(),
  checkoutReturnedAction: vi.fn(),
  fakePayAction: vi.fn(),
  openCheckoutAction: vi.fn(),
}))

// Step 4 once the hold has run out (docs/16 §3, §5): a checkout already opened may still be paid
// late, and then confirms the booking or is refunded, so the page says so and offers no fresh
// booking; it says nothing was taken only when no checkout was ever opened. Fake reference.

const draw = (paymentOpened: boolean) =>
  renderToStaticMarkup(
    <PayStep
      reference="IIIC-S-00001"
      holdExpiresAt="2020-01-01T00:00:00.000Z"
      amount={null}
      startAgainHref="/book/session"
      paymentOpened={paymentOpened}
    />,
  )

describe('the payment step after the hold ran out', () => {
  it('never says nothing was taken once a checkout was opened, and offers no new booking', () => {
    const html = draw(true)
    expect(html).toContain(PAY_COPY.expiredMayPay)
    expect(html).not.toContain('Nothing was taken')
    expect(html).not.toContain(PAY_COPY.startAgain)
  })

  it('says nothing was taken, and offers a new time, when no checkout was opened', () => {
    const html = draw(false)
    expect(html).toContain('Nothing was taken')
    expect(html).toContain(PAY_COPY.startAgain)
  })
})
