import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import { ACCOUNT_COPY, LOGIN_COPY, VERIFY_COPY } from '../../src/lib/accounts/signIn/copy'
import config from '../../src/payload.config'
import {
  askForCode,
  FAKE_ACCOUNT_NOTICE,
  openMyIiicForTests,
  ownNetwork,
  restoreMyIiic,
  signIn,
  SKIP_ACCOUNT_SPECS,
  SKIP_REASON,
  TEST_CODE,
} from '../helpers/accountSignIn'
import { assertLocalDatabase } from '../helpers/localDatabase'

// Signing in to My IIIC by email code (docs/20 §4, §10, §11), against the running site, on
// desktop and at phone width: the keyboard only, the account step with its boxes unticked and
// "No, thanks" beside it, the error summary taking focus, JavaScript off, no horizontal scroll at
// 320 px, axe, the headers, and exactly the cookies of docs/12 §10 through a sign-in and none
// after signing out. The server under test needs BETTER_AUTH_SECRET and ACCOUNTS_TEST_CODE (the
// fixed code, locally and in CI only): without them these skip locally and fail in CI. The flag
// and the shared fake account notice come from tests/helpers/accountSignIn.ts, which puts the
// flag back afterwards; each test has a fresh, obviously fake address and a network address of
// its own. They need slice B's My IIIC (its "Sign out"), so they run on the joined branch only.

const CODE = TEST_CODE
const RUN = Date.now().toString(36)

let payload: Payload
let accountsWereOn: boolean | null = null
const used: string[] = []

async function cms(): Promise<Payload> {
  assertLocalDatabase()
  payload ??= await getPayload({ config })
  return payload
}

function fakeAddress(project: string, what: string): string {
  const value = `e2e-sign-in-${what}-${project}-${RUN}@example.invalid`.toLowerCase()
  used.push(value)
  return value
}

const serious = async (page: Page) =>
  (await new AxeBuilder({ page }).include('main').analyze()).violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact ?? ''),
  )

const cookieNames = async (page: Page) =>
  (await page.context().cookies()).map((cookie) => cookie.name).sort()

/** Step 1 by the keyboard alone (focus the field, type, press Enter), then step 2 in focus. */
async function codeStep(page: Page, address: string) {
  await askForCode(page, address, { keyboard: true })
  await expect(page.getByRole('heading', { level: 1, name: VERIFY_COPY.heading })).toBeFocused()
}

test.describe('signing in to My IIIC', () => {
  test.skip(SKIP_ACCOUNT_SPECS, SKIP_REASON)
  test.use({ extraHTTPHeaders: ownNetwork })

  test.beforeAll(async () => {
    accountsWereOn = await openMyIiicForTests()
  })

  test.afterAll(async () => {
    const db = await cms()
    const { docs } = await db.find({
      collection: 'people',
      where: { email: { in: used } },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    })
    const accounts = docs
      .map((person) => (typeof person.account === 'object' ? person.account?.id : person.account))
      .filter((id): id is number => typeof id === 'number')
    if (accounts.length) {
      await db.delete({
        collection: 'accounts',
        where: { id: { in: accounts } },
        overrideAccess: true,
      })
    }
    await db.delete({ collection: 'people', where: { email: { in: used } }, overrideAccess: true })
    await restoreMyIiic(accountsWereOn)
  })

  test('sends a code and makes an account by the keyboard alone, with the boxes unticked', async ({
    page,
  }, testInfo) => {
    const address = fakeAddress(testInfo.project.name, 'keyboard')
    await page.goto('/login')
    expect(await serious(page)).toEqual([])
    // A page that reads cookies: rendered per request, never stored, never indexed.
    const response = await page.goto('/login')
    expect(response?.headers()['cache-control']).toMatch(/no-store/)
    expect(response?.headers()['x-robots-tag']).toMatch(/noindex/)

    await codeStep(page, address)
    // Only the sign-in cookie so far, for /login alone, holding no code.
    const signIn = (await page.context().cookies()).find((cookie) => cookie.name === 'iiic-sign-in')
    expect(await cookieNames(page)).toEqual(['iiic-sign-in'])
    expect(signIn?.path).toBe('/login')
    expect(signIn?.httpOnly).toBe(true)
    expect(signIn?.sameSite).toBe('Lax')
    expect(signIn?.value).not.toContain(CODE)
    expect(await serious(page)).toEqual([])

    const codeForm = page.getByRole('form', { name: VERIFY_COPY.heading })
    await codeForm.getByLabel(VERIFY_COPY.codeLabel).focus()
    await page.keyboard.type(CODE)
    await expect(codeForm.getByRole('checkbox', { name: VERIFY_COPY.trust })).not.toBeChecked()
    await page.keyboard.press('Enter')

    // A new address: the account step, on the same address bar.
    await expect(page.getByRole('heading', { level: 1, name: ACCOUNT_COPY.heading })).toBeFocused()
    await expect(page).toHaveTitle(ACCOUNT_COPY.title)
    const form = page.getByRole('form', { name: ACCOUNT_COPY.heading })
    const consent = form.getByRole('checkbox', { name: FAKE_ACCOUNT_NOTICE })
    const adult = form.getByRole('checkbox', { name: ACCOUNT_COPY.adult })
    await expect(consent).not.toBeChecked()
    await expect(adult).not.toBeChecked()
    // "No, thanks" beside "Create my account", the same size.
    const create = form.getByRole('button', { name: ACCOUNT_COPY.create, exact: true })
    const decline = form.getByRole('button', { name: ACCOUNT_COPY.decline, exact: true })
    const [createBox, declineBox] = [await create.boundingBox(), await decline.boundingBox()]
    expect(Math.abs((createBox?.height ?? 0) - (declineBox?.height ?? 1))).toBeLessThan(2)
    expect(await serious(page)).toEqual([])

    // Sent without ticking: the summary takes focus and names both boxes.
    await form.getByLabel(ACCOUNT_COPY.nameLabel).fill('Example Client')
    await create.focus()
    await page.keyboard.press('Enter')
    const summary = page.locator('.iiic-error-summary')
    await expect(summary).toBeFocused()
    await expect(summary).toContainText(ACCOUNT_COPY.consentMissing)
    await expect(summary).toContainText(ACCOUNT_COPY.adultMissing)

    await consent.focus()
    await page.keyboard.press('Space')
    await adult.focus()
    await page.keyboard.press('Space')
    await create.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/account$/)

    // Signed in on a device not kept: the session cookie for the browser session, and the
    // "not kept" cookie; the sign-in cookie is gone.
    const cookies = await page.context().cookies()
    expect(cookies.map((cookie) => cookie.name).sort()).toEqual([
      'iiic-account.dont_remember',
      'iiic-account.session_token',
    ])
    const session = cookies.find((cookie) => cookie.name === 'iiic-account.session_token')
    expect(session?.expires).toBe(-1)
    expect(session?.httpOnly).toBe(true)
    expect(session?.sameSite).toBe('Lax')
    expect(session?.path).toBe('/')

    // Signed in, /login goes on to My IIIC.
    await page.goto('/login')
    await expect(page).toHaveURL(/\/account$/)

    // "Sign out" on My IIIC's pages ends the session: no cookie is left.
    await page.getByRole('button', { name: 'Sign out', exact: true }).first().click()
    await expect(page).not.toHaveURL(/\/account/)
    expect(await cookieNames(page)).toEqual([])
  })

  test('keeps a device signed in for thirty days when the box is ticked', async ({
    page,
  }, testInfo) => {
    const address = fakeAddress(testInfo.project.name, 'kept')
    // Ticked at the code step: the account step's session keeps the device.
    expect(await signIn(page, address, { keep: true })).toBe('account-step')
    const cookies = await page.context().cookies()
    expect(cookies.map((cookie) => cookie.name)).toEqual(['iiic-account.session_token'])
    const days = ((cookies[0]?.expires ?? 0) * 1000 - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29)
    expect(days).toBeLessThanOrEqual(30)
  })

  test('says how many tries are left after a wrong code, with focus on the summary', async ({
    page,
  }, testInfo) => {
    const address = fakeAddress(testInfo.project.name, 'wrong')
    await codeStep(page, address)
    const wrong = CODE === '000000' ? '111111' : '000000'
    await page.getByLabel(VERIFY_COPY.codeLabel).fill(wrong)
    await page.getByRole('button', { name: VERIFY_COPY.submit, exact: true }).click()
    const summary = page.locator('.iiic-error-summary')
    await expect(summary).toBeFocused()
    await expect(summary).toContainText(VERIFY_COPY.wrongCode(4))
    await expect(page.locator('#verify-code-error')).toHaveText(VERIFY_COPY.wrongCode(4))
    expect(await serious(page)).toEqual([])
  })

  test('declines the account with "No, thanks", storing nothing', async ({ page }, testInfo) => {
    const address = fakeAddress(testInfo.project.name, 'declined')
    await codeStep(page, address)
    await page.getByLabel(VERIFY_COPY.codeLabel).fill(CODE)
    await page.getByRole('button', { name: VERIFY_COPY.submit, exact: true }).click()
    await page.getByRole('button', { name: ACCOUNT_COPY.decline, exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    expect(await cookieNames(page)).toEqual([])
    const db = await cms()
    const { totalDocs } = await db.count({
      collection: 'people',
      where: { email: { equals: address } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })

  test('answers "Start again" at the code step without a sign-in in progress', async ({ page }) => {
    const response = await page.goto('/login/verify')
    expect(response?.headers()['cache-control']).toMatch(/no-store/)
    await expect(
      page.getByRole('heading', { level: 1, name: VERIFY_COPY.startAgainHeading }),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: VERIFY_COPY.startAgainLink })).toHaveAttribute(
      'href',
      '/login',
    )
    expect(await cookieNames(page)).toEqual([])
  })

  test('has no horizontal scroll at 320 px', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/login')
    const wide = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(await wide()).toBe(false)
    await codeStep(page, fakeAddress(testInfo.project.name, 'narrow'))
    expect(await wide()).toBe(false)
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('signs a new address in, step by step', async ({ page }, testInfo) => {
      const address = fakeAddress(testInfo.project.name, 'no-script')
      await page.goto('/login')
      const step1 = page.getByRole('form', { name: LOGIN_COPY.emailButton })
      await step1.getByLabel(LOGIN_COPY.emailLabel).fill(address)
      await step1.getByRole('button', { name: LOGIN_COPY.emailButton }).click()
      await expect(page).toHaveURL(/\/login\/verify$/)

      // A malformed code comes back with its message, drawn by the server.
      await page.getByLabel(VERIFY_COPY.codeLabel).fill('12')
      await page.getByRole('button', { name: VERIFY_COPY.submit, exact: true }).click()
      await expect(page.locator('.iiic-error-summary')).toContainText(VERIFY_COPY.malformed)

      await page.getByLabel(VERIFY_COPY.codeLabel).fill(CODE)
      await page.getByRole('button', { name: VERIFY_COPY.submit, exact: true }).click()
      const form = page.getByRole('form', { name: ACCOUNT_COPY.heading })
      await form.getByLabel(ACCOUNT_COPY.nameLabel).fill('Example Client')
      await form.getByRole('checkbox', { name: FAKE_ACCOUNT_NOTICE }).check()
      await form.getByRole('checkbox', { name: ACCOUNT_COPY.adult }).check()
      await form.getByRole('button', { name: ACCOUNT_COPY.create, exact: true }).click()
      await expect(page).toHaveURL(/\/account$/)
      expect(await cookieNames(page)).toContain('iiic-account.session_token')
    })
  })
})
