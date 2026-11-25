import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { assertLocalDatabase } from '../helpers/localDatabase'
import {
  bookingByReference,
  FAKE,
  readSettings,
  seedBookables,
  setSettings,
} from '../helpers/seedBooking'

// My IIIC's records end to end (docs/20 §11, §13 slice B): a session booked as a guest appears
// after the person signs in with the same email; the overview and the booking carry the
// counselling scope statement and offer nothing; the booking is cancelled within policy, with
// JavaScript off as well as on; a second account cannot open the first's booking; every page is
// axe-clean, never scrolls sideways at 320 px, and is sent `private, no-store` and noindex.
//
// Sign-in is builder A's (docs/20 §4.1): these steps follow its words, and the code is CI's fixed
// test code (ACCOUNTS_TEST_CODE, refused on every Vercel deployment). Until A's pages and that
// code are in this build, the file is skipped. Every name, address and rule is fake.

const TEST_CODE = process.env.ACCOUNTS_TEST_CODE
const ACCOUNT_NOTICE = 'Fake account notice for tests: keep a My IIIC account for me.'
const HIDDEN = { flags: { pricesPublic: false, payAtBooking: false }, threshold: null }

let payload: Payload
let original: Awaited<ReturnType<typeof readSettings>>
let originalAccounts = false

/** A fresh, obviously fake address per run, so the sign-in limits never meet an earlier run. */
const freshEmail = (who: string) => `myiiic.${who}.${Date.now().toString(36)}@example.invalid`

async function payloadFor(): Promise<Payload> {
  assertLocalDatabase()
  payload ??= await getPayload({ config })
  return payload
}

/** My IIIC switched on, and the account notice a new account is made under (D-113, I-65's fake). */
async function openAccounts(on: boolean) {
  const db = await payloadFor()
  const settings = await db.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true })
  await db.updateGlobal({
    slug: 'settings',
    data: { flags: { ...(settings.flags ?? {}), accountsEnabled: on } },
    overrideAccess: true,
  })
  if (!on) return
  const { docs } = await db.find({
    collection: 'consent-versions',
    where: { and: [{ purpose: { equals: 'account' } }, { text: { equals: ACCOUNT_NOTICE } }] },
    limit: 1,
    overrideAccess: true,
  })
  if (docs[0]) return
  await db.create({
    collection: 'consent-versions',
    data: {
      purpose: 'account',
      language: 'en-IN',
      text: ACCOUNT_NOTICE,
      effectiveFrom: new Date(Date.now() - 86_400_000).toISOString(),
      effectiveFrom_tz: 'Asia/Kolkata',
    } as never,
    overrideAccess: true,
  })
}

/** Serious and critical axe findings on the page as it is now. */
async function blocking(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze()
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => violation.id)
}

/** Whether the page scrolls sideways at 320 px (docs/12 §9). */
async function scrollsSideways(page: Page): Promise<boolean> {
  await page.setViewportSize({ width: 320, height: 720 })
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
}

/** A free session (prices hidden) booked as a guest through M3's flow; returns its reference. */
async function bookAsGuest(page: Page, email: string): Promise<string> {
  await page.goto('/book/session')
  const main = page.getByRole('main')
  const service = main.getByText('Fake session', { exact: true })
  if (await service.count()) await service.first().click()
  const practitioner = main.getByText(FAKE.practitioner, { exact: true })
  if (await practitioner.count()) await practitioner.first().click()
  await main.getByRole('button', { name: 'Continue' }).click()
  await expect(main.getByRole('heading', { name: 'Choose a day and a time' })).toBeFocused()
  await main.locator('.iiic-slot').first().click()
  await main.getByRole('button', { name: 'Continue' }).click()
  await main.getByLabel('Full name').fill('Example Client (fake)')
  await main.getByLabel('Mobile number').fill('90000 00000')
  await main.getByLabel('Email', { exact: true }).fill(email)
  await main.getByText('Myself', { exact: true }).click()
  await main.getByText('18 or over', { exact: true }).click()
  await main
    .getByRole('group', { name: 'Your consent' })
    .locator('label.iiic-check')
    .first()
    .click()
  await main.getByRole('button', { name: 'Confirm booking' }).click()
  await page.waitForURL(/\/book\/confirmed\/IIIC-S-\d{5}$/)
  return page.url().split('/').pop() as string
}

/**
 * Signs in by email code as builder A's pages ask (docs/20 §4.1): the address, the test code,
 * and for a new address the account step with every box unticked until ticked here.
 */
async function signIn(page: Page, email: string) {
  await page.goto('/login')
  const main = page.getByRole('main')
  await main.getByLabel('Email address').fill(email)
  await main.getByRole('button', { name: 'Send me a code' }).click()
  await page.waitForURL(/\/login\/verify/)
  await main.getByLabel('Six-digit code').fill(TEST_CODE as string)
  await main.getByRole('button', { name: 'Sign in' }).click()
  const create = main.getByRole('button', { name: 'Create my account' })
  await expect(create.or(main.getByRole('heading', { level: 1 })).first()).toBeVisible()
  if (await create.count()) {
    // No box is ticked in advance (docs/20 §4.1; CLAUDE.md #9).
    for (const box of await main.getByRole('checkbox').all()) await expect(box).not.toBeChecked()
    // "I am 18 or older" and the consent beside the account notice; the device is not kept.
    for (const box of await main.getByRole('checkbox').all()) {
      const label = await box.evaluate(
        (input) => (input as HTMLInputElement).labels?.[0]?.textContent ?? '',
      )
      if (!/keep me signed in/i.test(label)) await box.check()
    }
    await create.click()
  }
  await page.waitForURL(/\/account$/)
}

async function newPage(browser: Browser, javaScriptEnabled = true): Promise<Page> {
  const context = await browser.newContext({ javaScriptEnabled })
  return context.newPage()
}

test.describe('My IIIC', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!TEST_CODE, 'Needs builder A’s sign-in and ACCOUNTS_TEST_CODE (docs/20 §11)')

  test.beforeAll(async () => {
    original = await readSettings()
    const db = await payloadFor()
    const settings = await db.findGlobal({ slug: 'settings', depth: 0, overrideAccess: true })
    originalAccounts = settings.flags?.accountsEnabled === true
    await seedBookables()
    await setSettings(HIDDEN)
    await openAccounts(true)
  })

  test.afterAll(async () => {
    await setSettings(original)
    await openAccounts(originalAccounts)
  })

  const first = freshEmail('first')
  let reference = ''
  let second = ''

  test('a session booked as a guest appears after sign-in, with the scope statement', async ({
    browser,
  }) => {
    const page = await newPage(browser)
    reference = await bookAsGuest(page, first)
    second = await bookAsGuest(page, first)
    await signIn(page, first)

    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1 })).toContainText('Hello')
    await expect(main.getByRole('heading', { name: 'Your next booking' })).toBeVisible()
    await expect(main.getByText(reference)).toBeVisible()
    // A counselling booking: the scope statement and the crisis numbers, and no offer.
    await expect(main.getByRole('heading', { name: 'If you need help now' })).toBeVisible()
    for (const href of await main
      .locator('a[href]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))) {
      expect(href, 'My IIIC links to the account, the booking and IIIC only').toMatch(
        /^(\/account(\/|$|\?)|\/institute\/verify|tel:|mailto:|https:)/,
      )
    }
    await expect(main).not.toContainText('₹')
    expect(await blocking(page)).toEqual([])

    await page
      .getByRole('navigation', { name: 'My IIIC' })
      .getByRole('link', { name: 'Bookings' })
      .click()
    await page.waitForURL(/\/account\/bookings$/)
    await expect(main.getByRole('link', { name: reference })).toBeVisible()
    await expect(main.getByRole('link', { name: second })).toBeVisible()
    expect(await blocking(page)).toEqual([])
    expect(await scrollsSideways(page)).toBe(false)
    await page.context().close()
  })

  test('cancels a booking within policy, with "Keep my booking" beside it', async ({ browser }) => {
    const page = await newPage(browser)
    await signIn(page, first)
    await page.goto(`/account/bookings/${reference}`)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { name: 'Your booking', level: 1 })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Add to your calendar (.ics)' })).toBeVisible()
    await main.getByRole('link', { name: 'Cancel booking' }).click()
    await expect(main.getByRole('heading', { name: 'Cancel this booking' })).toBeFocused()
    await expect(main).toContainText('Nothing has been paid, so there is nothing to refund.')
    const keep = await main.getByRole('link', { name: 'Keep my booking' }).boundingBox()
    const cancel = await main.getByRole('button', { name: 'Cancel my booking' }).boundingBox()
    expect(Math.abs((keep?.height ?? 0) - (cancel?.height ?? 0))).toBeLessThan(2)
    expect(await blocking(page)).toEqual([])
    await main.getByRole('button', { name: 'Cancel my booking' }).click()
    await expect(main.getByRole('status')).toContainText('Cancelled.')
    expect((await bookingByReference(reference))?.status).toBe('cancelledByClient')
    expect(await scrollsSideways(page)).toBe(false)
    await page.context().close()
  })

  test('works without JavaScript: the booking opens and cancels from the server’s forms', async ({
    browser,
  }) => {
    const page = await newPage(browser, false)
    await signIn(page, first)
    await page.goto(`/account/bookings/${second}?step=cancel`)
    const main = page.getByRole('main')
    await main.getByRole('button', { name: 'Cancel my booking' }).click()
    await page.waitForURL(new RegExp(`/account/bookings/${second}\\?done=cancelled`))
    await expect(main.getByRole('status')).toContainText('Cancelled.')
    expect((await bookingByReference(second))?.status).toBe('cancelledByClient')
    await page.context().close()
  })

  test('another account cannot open the first’s booking: it does not exist for them', async ({
    browser,
  }) => {
    const page = await newPage(browser)
    await signIn(page, freshEmail('second'))
    const response = await page.goto(`/account/bookings/${reference}`)
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('main')).not.toContainText(reference)
    const invite = await page.request.get(`/account/bookings/${reference}/invite.ics`)
    expect(invite.status()).toBe(404)
    await page.context().close()
  })

  test('every page is private: never cached, never indexed, and signing out ends it', async ({
    browser,
  }) => {
    const page = await newPage(browser)
    await signIn(page, first)
    for (const path of [
      '/account',
      '/account/bookings',
      '/account/documents',
      '/account/invoices',
    ]) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(200)
      const headers = response?.headers() ?? {}
      expect(headers['cache-control'], path).toMatch(/private/)
      expect(headers['cache-control'], path).toMatch(/no-store/)
      expect(headers['x-robots-tag'], path).toBe('noindex')
      expect(await blocking(page), path).toEqual([])
      expect(await scrollsSideways(page), path).toBe(false)
      await page.setViewportSize({ width: 1280, height: 800 })
    }
    await expect(page.getByRole('main')).not.toContainText('₹')
    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL((url) => url.pathname === '/')
    await page.goto('/account')
    await expect(page).toHaveURL(/\/login/)
    await page.context().close()
  })
})
