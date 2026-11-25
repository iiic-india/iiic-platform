import AxeBuilder from '@axe-core/playwright'
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test'

import {
  openMyIiicForTests,
  ownNetwork,
  restoreMyIiic,
  signIn,
  SKIP_ACCOUNT_SPECS,
  SKIP_REASON,
} from '../helpers/accountSignIn'
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
// Sign-in is builder A's (docs/20 §4.1), through the shared helper (tests/helpers/accountSignIn.ts):
// its words, CI's fixed test code (ACCOUNTS_TEST_CODE, refused on every Vercel deployment), the
// shared fake account notice, and a network address of its own for each test. Without the code
// and Better Auth's secret the file skips locally and fails in CI. Sign-in allows one code a
// minute for an address (D-116), so the first address signs in once, in the first test, and the
// later tests open their browsers with that session (Playwright's storage state); the sign-out
// test, which ends it, comes last. Every name, address and rule is fake.

const HIDDEN = { flags: { pricesPublic: false, payAtBooking: false }, threshold: null }

let original: Awaited<ReturnType<typeof readSettings>>
let accountsWereOn: boolean | null = null

/** A fresh, obviously fake address per run, so the sign-in limits never meet an earlier run. */
const freshEmail = (who: string) => `myiiic.${who}.${Date.now().toString(36)}@example.invalid`

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

/** The first address's session, saved once it has signed in (the first test). */
type Session = Awaited<ReturnType<BrowserContext['storageState']>>

/**
 * A page in a context of its own; with `session`, already signed in as that browser was. The
 * test's network address reaches this context too (Playwright fills `extraHTTPHeaders` in).
 */
async function newPage(
  browser: Browser,
  javaScriptEnabled = true,
  session?: Session,
): Promise<Page> {
  const options: BrowserContextOptions = { javaScriptEnabled }
  if (session) options.storageState = session
  const context = await browser.newContext(options)
  return context.newPage()
}

test.describe('My IIIC', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(SKIP_ACCOUNT_SPECS, SKIP_REASON)
  test.use({ extraHTTPHeaders: ownNetwork })

  test.beforeAll(async () => {
    original = await readSettings()
    await seedBookables()
    await setSettings(HIDDEN)
    accountsWereOn = await openMyIiicForTests()
  })

  test.afterAll(async () => {
    await setSettings(original)
    await restoreMyIiic(accountsWereOn)
  })

  const first = freshEmail('first')
  let firstSession: Session | undefined
  let reference = ''
  let second = ''

  /** A page signed in as the first address, without asking for another code. */
  const asFirst = (browser: Browser, javaScriptEnabled = true) => {
    if (!firstSession) throw new Error('the first test did not sign the first address in')
    return newPage(browser, javaScriptEnabled, firstSession)
  }

  test('a session booked as a guest appears after sign-in, with the scope statement', async ({
    browser,
  }) => {
    const page = await newPage(browser)
    reference = await bookAsGuest(page, first)
    second = await bookAsGuest(page, first)
    // A new address that booked as a guest: the account step, then My IIIC.
    expect(await signIn(page, first)).toBe('account-step')
    firstSession = await page.context().storageState()

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
    const page = await asFirst(browser)
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
    const page = await asFirst(browser, false)
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
    // A second, new address: its own account step, its name filled (an empty one is refused).
    expect(await signIn(page, freshEmail('second'), { name: 'Example Second Client' })).toBe(
      'account-step',
    )
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
    const page = await asFirst(browser)
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
