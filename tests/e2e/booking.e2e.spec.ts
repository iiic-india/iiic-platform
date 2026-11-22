import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'

import {
  bookingByReference,
  bookingsRescheduledFrom,
  FAKE,
  gatewayEventsOf,
  lapseHold,
  paymentsOf,
  readSettings,
  refundsOf,
  seedBookables,
  setSettings,
} from '../helpers/seedBooking'

// The booking flow end to end (docs/10 M3, "Done when"; docs/16 §11): paid booking, free
// booking, payment failure, hold expiry, reschedule, cancellation with refund, and two people
// paying for one slot. Payments go through the fake gateway (PAYMENT_GATEWAY=fake, which CI sets
// and src/lib/env.ts refuses on any Vercel deployment): its test buttons pay or fail the order in
// the server's fake, which posts the signed webhook to the real route, so the signature check,
// the event's single processing and ConfirmBooking all run as they do with Razorpay. Every
// name, price and rule is fake (tests/helpers/seedBooking.ts).

const PERSON = {
  name: 'Test Client (fake)',
  mobile: '98765 43210',
  email: 'client.test@example.invalid',
}

const PAID = { flags: { pricesPublic: true, payAtBooking: true }, threshold: 1_000_000 }
const HIDDEN = { flags: { pricesPublic: false, payAtBooking: false }, threshold: null }

let original: Awaited<ReturnType<typeof readSettings>>

test.describe('Booking', () => {
  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    original = await readSettings()
    await seedBookables()
  })
  test.afterAll(async () => setSettings(original))

  /** Serious and critical axe findings on the page as it is now. */
  async function blocking(page: Page): Promise<string[]> {
    const results = await new AxeBuilder({ page }).analyze()
    return results.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => violation.id)
  }

  /** Steps 1 and 2: the fake service, then the first free time. Returns the start chosen. */
  async function chooseFirstTime(page: Page, type: 'session' | 'call'): Promise<string> {
    await page.goto(`/book/${type}`)
    const service = page.getByText(type === 'session' ? 'Fake session' : 'Fake proposal call', {
      exact: true,
    })
    if (await service.count()) await service.first().click()
    const practitioner = page.getByText(FAKE.practitioner, { exact: true })
    if (await practitioner.count()) await practitioner.first().click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a day and a time' })).toBeFocused()
    const slot = page.locator('.iiic-slot').first()
    await expect(slot).toBeVisible()
    const startsAt = (await slot.locator('input').getAttribute('value')) ?? ''
    await slot.click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Your details' })).toBeFocused()
    return startsAt
  }

  /** Step 3: the details and the one consent a booking needs, unticked until clicked. */
  async function fillDetails(page: Page, type: 'session' | 'call') {
    await page.getByLabel('Full name').fill(PERSON.name)
    await page.getByLabel('Mobile number').fill(PERSON.mobile)
    await page
      .getByLabel(type === 'call' ? 'Work email' : 'Email', { exact: true })
      .fill(PERSON.email)
    if (type === 'session') {
      await page.getByText('Myself', { exact: true }).click()
      await page.getByText('18 or over', { exact: true }).click()
    } else {
      await page.getByLabel('Company').fill('Fake Company')
    }
    const consent = page.getByRole('checkbox', { name: FAKE.consentText })
    await expect(consent).not.toBeChecked()
    await page.getByText(FAKE.consentText).click()
    await expect(consent).toBeChecked()
  }

  /** A session up to its payment step; returns the reference and the start. */
  async function holdASession(page: Page): Promise<{ reference: string; startsAt: string }> {
    const startsAt = await chooseFirstTime(page, 'session')
    await fillDetails(page, 'session')
    await expect(page.getByText('₹1,500').first()).toBeVisible()
    await page.getByRole('button', { name: 'Continue to payment' }).click()
    await page.waitForURL(/\/book\/pay\/IIIC-S-\d{5}$/)
    return { reference: page.url().split('/').pop() as string, startsAt }
  }

  async function openTestCheckout(page: Page) {
    await page.getByRole('button', { name: /^Pay ₹1,500$/ }).click()
    await expect(page.getByRole('group', { name: /Test payment/ })).toBeVisible()
  }

  async function payAndConfirm(page: Page, reference: string) {
    await page.getByRole('button', { name: 'Pay with the test gateway' }).click()
    await page.waitForURL(`**/book/confirmed/${reference}`)
    await expect(page.getByRole('heading', { name: 'Booked', level: 1 })).toBeVisible()
  }

  test('a paid session: details, the total, the hold, payment, then confirmed once', async ({
    page,
  }) => {
    await setSettings(PAID)
    const { reference } = await holdASession(page)
    expect(await blocking(page)).toEqual([])
    await expect(page.getByRole('timer')).toContainText('Your time is held for')
    // The counselling scope statement and the crisis numbers (docs/08 §7).
    await expect(page.getByRole('heading', { name: 'If you need help now' })).toBeVisible()
    await openTestCheckout(page)
    await payAndConfirm(page, reference)
    await expect(page.getByText(reference)).toBeVisible()

    const booking = await bookingByReference(reference)
    expect(booking?.status).toBe('confirmed')
    expect(booking?.paymentStatus).toBe('paid')
    const [payment] = await paymentsOf(booking?.id as number)
    expect(payment?.status).toBe('captured')
    expect(payment?.amountPaise).toBe(FAKE.sessionPricePaise)
    const events = await gatewayEventsOf(payment?.id as number)
    expect(events.filter((event) => event.type === 'payment.captured')).toHaveLength(1)
  })

  test('a free call: no payment step, confirmed at once, nothing to pay', async ({ page }) => {
    await setSettings(PAID)
    await chooseFirstTime(page, 'call')
    await fillDetails(page, 'call')
    expect(await blocking(page)).toEqual([])
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    await page.waitForURL(/\/book\/confirmed\/IIIC-C-\d{5}$/)
    await expect(page.getByRole('heading', { name: 'Booked', level: 1 })).toBeVisible()
    const reference = page.url().split('/').pop() as string
    const booking = await bookingByReference(reference)
    expect(booking?.status).toBe('confirmed')
    expect(booking?.paymentStatus).toBe('notRequired')
  })

  test('a session while prices are hidden: no price anywhere, confirmed and unpaid', async ({
    page,
  }) => {
    await setSettings(HIDDEN)
    await chooseFirstTime(page, 'session')
    await fillDetails(page, 'session')
    await expect(page.locator('body')).not.toContainText('₹')
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    await page.waitForURL(/\/book\/confirmed\/IIIC-S-\d{5}$/)
    await expect(page.locator('body')).not.toContainText('₹')
    const booking = await bookingByReference(page.url().split('/').pop() as string)
    expect(booking?.status).toBe('confirmed')
    expect(booking?.paymentStatus).toBe('unpaid')
  })

  test('a failed payment keeps the same hold, and a second attempt confirms', async ({ page }) => {
    await setSettings(PAID)
    const { reference } = await holdASession(page)
    const heldUntil = (await bookingByReference(reference))?.holdExpiresAt
    await openTestCheckout(page)
    await page.getByRole('button', { name: 'Fail the test payment' }).click()
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'The payment did not go through',
    )
    const after = await bookingByReference(reference)
    expect(after?.status).toBe('pendingPayment')
    expect(after?.holdExpiresAt).toBe(heldUntil)
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByRole('group', { name: /Test payment/ })).toBeVisible()
    await payAndConfirm(page, reference)
    expect((await bookingByReference(reference))?.paymentStatus).toBe('paid')
  })

  test('a hold that runs out frees its time for the next person', async ({ page, browser }) => {
    await setSettings(PAID)
    const { reference, startsAt } = await holdASession(page)
    await lapseHold(reference)
    await page.reload()
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'The time held for you ran out',
    )
    const other = await browser.newPage()
    await other.goto('/book/session')
    await other.getByRole('button', { name: 'Continue' }).click()
    const first = other.locator('.iiic-slot input').first()
    await expect(first).toHaveAttribute('value', startsAt)
    await other.close()
  })

  test('two people pay for one time: exactly one is confirmed, the other refunded', async ({
    page,
    browser,
  }) => {
    await setSettings(PAID)
    const first = await holdASession(page)
    await openTestCheckout(page)
    // A's hold runs out while A is still on the checkout.
    await lapseHold(first.reference)
    const second = await payInAnotherBrowser(browser, first.startsAt)
    // A's payment arrives late: the time is B's, so A's money goes back in full (B10).
    await page.getByRole('button', { name: 'Pay with the test gateway' }).click()
    await expect(page.locator('main').getByRole('alert')).toContainText(
      'Someone else booked this time',
    )

    const lost = await bookingByReference(first.reference)
    const won = await bookingByReference(second)
    expect(won?.status).toBe('confirmed')
    expect(lost?.status).toBe('expired')
    const refunds = await refundsOf(lost?.id as number)
    expect(refunds.map((refund) => refund.reason)).toEqual(['slotTaken'])
    expect(refunds[0]?.amountPaise).toBe(FAKE.sessionPricePaise)
  })

  async function payInAnotherBrowser(browser: Browser, startsAt: string): Promise<string> {
    const context = await browser.newContext()
    const other = await context.newPage()
    const held = await holdASession(other)
    expect(held.startsAt).toBe(startsAt)
    await openTestCheckout(other)
    await payAndConfirm(other, held.reference)
    await context.close()
    return held.reference
  }

  /** A paid, confirmed session; returns the manage link the confirmation shows. */
  async function paidSession(page: Page): Promise<{ reference: string; manage: string }> {
    const { reference } = await holdASession(page)
    await openTestCheckout(page)
    await payAndConfirm(page, reference)
    const manage = await page
      .getByRole('link', { name: 'Change or cancel this booking' })
      .getAttribute('href')
    return { reference, manage: manage as string }
  }

  test('a reschedule by the manage link moves the booking to a new one', async ({ page }) => {
    await setSettings(PAID)
    const { reference, manage } = await paidSession(page)
    await page.goto(manage)
    expect(await blocking(page)).toEqual([])
    await page.getByRole('button', { name: 'Move to another time' }).click()
    await expect(page.getByRole('heading', { name: 'Choose a new time' })).toBeFocused()
    await page.locator('.iiic-slot').first().click()
    await page.getByRole('button', { name: 'Move my booking' }).click()
    await expect(page.getByRole('heading', { name: /^Moved\./ })).toBeVisible()
    const old = await bookingByReference(reference)
    expect(old?.status).toBe('rescheduled')
    const moved = await bookingsRescheduledFrom(old?.id as number)
    expect(moved).toHaveLength(1)
    expect(moved[0]?.status).toBe('confirmed')
  })

  test('a cancellation within the rule shows its refund first, then refunds it', async ({
    page,
  }) => {
    await setSettings(PAID)
    const { reference, manage } = await paidSession(page)
    await page.goto(manage)
    await page.getByRole('button', { name: 'Cancel booking' }).click()
    await expect(page.getByText('You get ₹1,500 back, to the way you paid.')).toBeVisible()
    // "Keep my booking" stands beside the cancel button at the same weight (docs/08 §5).
    await expect(page.getByRole('button', { name: 'Keep my booking' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel my booking' }).click()
    await expect(page.getByRole('heading', { name: /^Cancelled\./ })).toBeVisible()
    await expect(page.getByText('Your refund has been sent')).toBeVisible()

    const booking = await bookingByReference(reference)
    expect(booking?.status).toBe('cancelledByClient')
    const [refund] = await refundsOf(booking?.id as number)
    expect(refund?.reason).toBe('cancelledByClient')
    expect(refund?.amountPaise).toBe(FAKE.sessionPricePaise)
    expect(refund?.status).toBe('processed')
    const [payment] = await paymentsOf(booking?.id as number)
    expect(payment?.status).toBe('refunded')
  })

  test('a confirmation opened in another browser shows only that the booking exists', async ({
    page,
    browser,
  }) => {
    await setSettings(PAID)
    await chooseFirstTime(page, 'call')
    await fillDetails(page, 'call')
    await page.getByRole('button', { name: 'Confirm booking' }).click()
    await page.waitForURL(/\/book\/confirmed\/IIIC-C-\d{5}$/)
    const stranger = await browser.newPage()
    await stranger.goto(page.url())
    await expect(stranger.locator('main')).toContainText('A booking with this reference exists')
    await expect(stranger.locator('main')).not.toContainText(FAKE.practitioner)
    await stranger.close()
  })
})
