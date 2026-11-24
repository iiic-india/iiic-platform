import AxeBuilder from '@axe-core/playwright'
import { sql } from '@payloadcms/db-postgres'
import { expect, type Page, test } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import {
  AGREED_COPY,
  CLOSE_COPY,
  CLOSED_COPY,
  ERROR_COPY,
  MESSAGES_COPY,
  PAGE_COPY,
  REQUEST_COPY,
  REQUEST_TYPE_LABELS,
} from '../../src/lib/accounts/privacy/copy'
import type { ConsentVersion } from '../../src/payload-types'
import config from '../../src/payload.config'
import { assertLocalDatabase } from '../helpers/localDatabase'

// My IIIC's privacy page (docs/20 §7.5, §11; slice C) against the running site, on desktop and
// at phone width: signed in with the fixed test code (ACCOUNTS_TEST_CODE, CI only), a person
// sees what they agreed to, gives the Journal under its notice and withdraws it, asks for a copy
// of their data, and reaches the closing page with "Close my account" and "No, thanks" at equal
// weight; keyboard only, axe-clean, without JavaScript, with no horizontal scroll at 320 px, and
// sent private and noindex. Sign-in is builder A's: these run once A has joined (its steps are
// read here by the labels docs/20 §4.1 gives them). Fake notices are put in force for the account
// and for the Journal; every person, account and request is obviously fake and removed after.

const TEST_CODE = process.env.ACCOUNTS_TEST_CODE ?? ''
const PAGE = '/account/privacy'
const ACCOUNT_NOTICE = 'Fake account notice for an end-to-end test: IIIC may keep this account.'
const JOURNAL_NOTICE = 'Fake consent text for an end-to-end test: send me the monthly Journal.'
const PREFIX = 'e2e-privacy-'

let payload: Payload
let restoreAccounts: boolean | null = null

async function cms(): Promise<Payload> {
  assertLocalDatabase()
  payload ??= await getPayload({ config })
  return payload
}

const fakeEmail = (what: string, project: string) =>
  `${PREFIX}${what}-${project}-${Date.now().toString(36)}@example.invalid`.toLowerCase()

/** Signs a new address in with the fixed code and makes its account (docs/20 §4.1). */
async function signIn(page: Page, email: string) {
  await page.goto('/login')
  const main = page.getByRole('main')
  await main.getByLabel('Email address').fill(email)
  await main.getByRole('button', { name: 'Send me a code' }).click()
  await expect(page).toHaveURL(/\/login\/verify/)
  await main.getByLabel('Six-digit code').fill(TEST_CODE)
  await main.getByRole('button', { name: 'Sign in', exact: true }).click()
  // A new address: the account step, every box unticked until the person ticks it.
  await main.getByLabel('Full name').fill('Example Client')
  const notice = main.getByRole('checkbox', { name: ACCOUNT_NOTICE })
  await expect(notice).not.toBeChecked()
  await notice.check()
  await main.getByRole('checkbox', { name: 'I am 18 or older' }).check()
  await main.getByRole('button', { name: 'Create my account' }).click()
  await expect(page).toHaveURL(/\/account$/)
}

async function personOf(email: string): Promise<number> {
  const db = await cms()
  const { docs } = await db.find({
    collection: 'people',
    where: { email: { equals: email } },
    depth: 0,
    limit: 1,
  })
  return docs[0]?.id ?? 0
}

async function noHorizontalScroll(page: Page) {
  await page.setViewportSize({ width: 320, height: 720 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('My IIIC · privacy and settings', () => {
  test.skip(
    !TEST_CODE,
    'Needs ACCOUNTS_TEST_CODE: sign-in uses the fixed code (CI, after A joins).',
  )

  test.beforeAll(async () => {
    const db = await cms()
    const settings = await db.findGlobal({ slug: 'settings', depth: 0 })
    restoreAccounts = settings.flags?.accountsEnabled === true
    await db.updateGlobal({ slug: 'settings', data: { flags: { accountsEnabled: true } } })
    // Notices in force are kept for good, as every test that writes one keeps them.
    for (const [purpose, text] of [
      ['account', ACCOUNT_NOTICE],
      ['marketingEmail', JOURNAL_NOTICE],
    ] as const) {
      await db.create({
        collection: 'consent-versions',
        data: {
          purpose,
          language: 'en-IN',
          text,
          effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
        } as ConsentVersion,
      })
    }
  })

  test.afterAll(async ({}, testInfo) => {
    const db = await cms()
    // This project's people only: the desktop and phone projects each sign in their own.
    const mine = `-${testInfo.project.name.toLowerCase()}-`
    const { docs } = await db.find({
      collection: 'people',
      where: { and: [{ email: { like: PREFIX } }, { email: { like: mine } }] },
      pagination: false,
      depth: 0,
    })
    const ids = docs.map((doc) => doc.id)
    if (ids.length) {
      const requests = await db.find({
        collection: 'data-requests',
        where: { person: { in: ids } },
        pagination: false,
        depth: 0,
      })
      for (const request of requests.docs) {
        await db.db.drizzle.execute(
          sql`DELETE FROM "payload_jobs" WHERE "input"->>'dataRequestId' = ${String(request.id)}`,
        )
        await db.delete({
          collection: 'messages',
          where: {
            and: [
              { subjectCollection: { equals: 'data-requests' } },
              { subjectId: { equals: request.id } },
            ],
          },
        })
      }
      await db.delete({ collection: 'data-requests', where: { person: { in: ids } } })
      await db.delete({ collection: 'accounts', where: { person: { in: ids } } })
      await db.delete({ collection: 'people', where: { id: { in: ids } } })
    }
    await db.delete({
      collection: 'subscribers',
      where: { and: [{ email: { like: PREFIX } }, { email: { like: mine } }] },
    })
    // Better Auth's own rows for these addresses (docs/20 §3.2), once its schema exists.
    try {
      await db.db.drizzle.execute(
        sql`DELETE FROM "customer_auth"."users" WHERE "email" LIKE ${`${PREFIX}%${mine}%`}`,
      )
    } catch {
      // No customer_auth schema yet: nothing of Better Auth's was written.
    }
    if (restoreAccounts !== null) {
      await db.updateGlobal({
        slug: 'settings',
        data: { flags: { accountsEnabled: restoreAccounts } },
      })
    }
  })

  test('is private, axe-clean and shows what the person agreed to', async ({ page }, testInfo) => {
    await signIn(page, fakeEmail('agreed', testInfo.project.name))
    const response = await page.goto(PAGE)
    expect(response?.headers()['cache-control']).toContain('no-store')
    expect(response?.headers()['x-robots-tag']).toContain('noindex')
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1, name: PAGE_COPY.heading })).toBeVisible()
    const agreed = main.getByRole('region', { name: AGREED_COPY.heading })
    const accountRow = agreed.getByRole('row', { name: /Keeping a My IIIC account/ })
    await expect(accountRow.getByRole('cell', { name: AGREED_COPY.granted })).toBeVisible()
    // The account consent ends by closing the account, never by a withdraw button (D-113).
    await expect(accountRow.getByRole('link', { name: AGREED_COPY.close })).toBeVisible()
    await expect(accountRow.getByRole('button')).toHaveCount(0)
    const results = await new AxeBuilder({ page }).include('main').analyze()
    expect(results.violations).toEqual([])
    await noHorizontalScroll(page)
  })

  test('gives the Journal under its notice with the keyboard, then withdraws it at once', async ({
    page,
  }, testInfo) => {
    const email = fakeEmail('journal', testInfo.project.name)
    await signIn(page, email)
    await page.goto(PAGE)
    const messages = page.getByRole('main').getByRole('region', { name: MESSAGES_COPY.heading })
    const offer = messages.getByRole('form', { name: MESSAGES_COPY.offers.marketingEmail.title })
    const box = offer.getByRole('checkbox', { name: JOURNAL_NOTICE })
    await expect(box).not.toBeChecked()

    // Sent unticked: an answer to check, with the focus on the summary and a link to the box.
    await offer.getByRole('button', { name: MESSAGES_COPY.offers.marketingEmail.button }).focus()
    await page.keyboard.press('Enter')
    const summary = messages.getByRole('alert').filter({ hasText: ERROR_COPY.unticked })
    await expect(summary).toBeFocused()

    await box.focus()
    await page.keyboard.press('Space')
    await expect(box).toBeChecked()
    await offer.getByRole('button', { name: MESSAGES_COPY.offers.marketingEmail.button }).focus()
    await page.keyboard.press('Enter')
    await expect(messages.getByRole('status')).toContainText(
      MESSAGES_COPY.offers.marketingEmail.given,
    )

    const agreed = page.getByRole('main').getByRole('region', { name: AGREED_COPY.heading })
    const withdraw = agreed.getByRole('button', {
      name: `${AGREED_COPY.withdraw}: Marketing email`,
    })
    await withdraw.focus()
    await page.keyboard.press('Enter')
    await expect(agreed.getByRole('status')).toContainText('Withdrawn: Marketing email')
    await expect(
      agreed.getByRole('row', { name: /Marketing email/ }).getByRole('cell', {
        name: AGREED_COPY.withdrawn,
      }),
    ).toBeVisible()

    const db = await cms()
    const person = await personOf(email)
    const { docs } = await db.find({
      collection: 'consents',
      where: {
        and: [{ person: { equals: person } }, { purpose: { equals: 'marketingEmail' } }],
      },
      depth: 0,
    })
    // One consent and its withdrawal, each from this page.
    expect(docs).toHaveLength(2)
    expect(docs.every((doc) => doc.channel === 'web' && doc.evidence?.form === 'My IIIC')).toBe(
      true,
    )
  })

  test('asks for a copy of the data, recorded for the office', async ({ page }, testInfo) => {
    const email = fakeEmail('request', testInfo.project.name)
    await signIn(page, email)
    await page.goto(`${PAGE}#requests`)
    const requests = page.getByRole('main').getByRole('region', { name: REQUEST_COPY.heading })
    // Nothing typed: the summary names both answers to check and takes the focus.
    await requests.getByRole('button', { name: REQUEST_COPY.button }).click()
    await expect(requests.getByRole('alert')).toBeFocused()
    await expect(requests.getByRole('link', { name: REQUEST_COPY.errors.type })).toBeVisible()

    await requests.getByLabel(REQUEST_COPY.type).selectOption({ label: REQUEST_TYPE_LABELS.access })
    await requests.getByLabel(REQUEST_COPY.summary).fill('Fake: a copy of my data, please.')
    await requests.getByRole('button', { name: REQUEST_COPY.button }).click()
    await expect(requests.getByRole('status')).toContainText(REQUEST_COPY.sent)
    await expect(
      requests.getByRole('row', { name: new RegExp(REQUEST_TYPE_LABELS.access) }),
    ).toBeVisible()

    const db = await cms()
    const { docs } = await db.find({
      collection: 'data-requests',
      where: { person: { equals: await personOf(email) } },
      depth: 0,
    })
    expect(docs).toEqual([
      expect.objectContaining({
        type: 'access',
        status: 'received',
        channel: 'web',
        verificationMethod: 'oneTimeCode',
      }),
    ])
  })

  test('offers closing with "No, thanks" at equal weight, and closes the account', async ({
    page,
  }, testInfo) => {
    await signIn(page, fakeEmail('close', testInfo.project.name))
    await page.goto(PAGE)
    await page
      .getByRole('main')
      .getByRole('region', { name: CLOSE_COPY.heading })
      .getByRole('link', { name: CLOSE_COPY.link })
      .click()
    await expect(page).toHaveURL(/\/account\/privacy\/close$/)
    const main = page.getByRole('main')
    const close = main.getByRole('button', { name: CLOSE_COPY.button })
    const decline = main.getByRole('link', { name: CLOSE_COPY.decline })
    const [closeBox, declineBox] = [await close.boundingBox(), await decline.boundingBox()]
    expect(Math.round(declineBox?.height ?? 0)).toBe(Math.round(closeBox?.height ?? -1))
    const results = await new AxeBuilder({ page }).include('main').analyze()
    expect(results.violations).toEqual([])
    await noHorizontalScroll(page)

    await page.setViewportSize({ width: 1280, height: 900 })
    await close.click()
    await expect(page).toHaveURL(/\/account\/privacy\/closed$/)
    await expect(main.getByRole('heading', { level: 1, name: CLOSED_COPY.heading })).toBeVisible()
    // Signed out everywhere: My IIIC sends the browser to sign in.
    await page.goto(PAGE)
    await expect(page).toHaveURL(/\/login/)
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('gives and withdraws a consent, and keeps a request’s words when refused', async ({
      page,
    }, testInfo) => {
      await signIn(page, fakeEmail('nojs', testInfo.project.name))
      await page.goto(PAGE)
      const main = page.getByRole('main')
      const offer = main.getByRole('form', { name: MESSAGES_COPY.offers.marketingEmail.title })
      await offer.getByRole('checkbox', { name: JOURNAL_NOTICE }).check()
      await offer.getByRole('button', { name: MESSAGES_COPY.offers.marketingEmail.button }).click()
      await expect(main.getByRole('status')).toContainText(
        MESSAGES_COPY.offers.marketingEmail.given,
      )
      await main.getByRole('button', { name: `${AGREED_COPY.withdraw}: Marketing email` }).click()
      await expect(main.getByRole('status')).toContainText('Withdrawn: Marketing email')

      const requests = main.getByRole('region', { name: REQUEST_COPY.heading })
      await requests.getByLabel(REQUEST_COPY.summary).fill('Fake words to keep.')
      await requests.getByRole('button', { name: REQUEST_COPY.button }).click()
      const again = page.getByRole('main').getByRole('region', { name: REQUEST_COPY.heading })
      await expect(again.getByRole('link', { name: REQUEST_COPY.errors.type })).toBeVisible()
      await expect(again.getByLabel(REQUEST_COPY.summary)).toHaveValue('Fake words to keep.')
    })
  })
})
