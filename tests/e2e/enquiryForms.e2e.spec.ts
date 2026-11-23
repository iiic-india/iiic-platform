import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import { FORM_COPY, REFUSALS } from '../../src/lib/enquiryForms/strings'
import { FORM_MESSAGES } from '../../src/lib/pipeline/forms'
import config from '../../src/payload.config'
import { assertLocalDatabase } from '../helpers/localDatabase'

// The Team Map request at /organisations/team-map (docs/17 §6, §11), against the running site,
// on desktop and at phone width, with a fake consent text in force. Data is written through the
// local API, obviously fake, and removed afterwards. These run once M4's migration exists (the
// enquiries table and the enquiryReplies purpose), which the lead generates when the slices join.

const PAGE = '/organisations/team-map'
const copy = FORM_COPY.teamMap
const FAKE_NOTICE =
  'Fake consent text for an end-to-end test: IIIC may keep these details and reply.'
/** A person cannot fill a form faster than this (src/lib/enquiryForms/guards.ts). */
const MIN_FILL_MS = 3_000

let payload: Payload
let noticeId: number | null = null

async function cms(): Promise<Payload> {
  assertLocalDatabase()
  payload ??= await getPayload({ config })
  return payload
}

const fakeEmail = (project: string, what: string) =>
  `e2e-${what}-${project}@example.invalid`.toLowerCase()

async function enquiriesFrom(email: string): Promise<number> {
  const db = await cms()
  const { totalDocs } = await db.count({
    collection: 'enquiries',
    where: { 'submitted.email': { equals: email } },
    overrideAccess: true,
  })
  return totalDocs
}

async function fill(page: Page, email: string, { tick = true } = {}) {
  const form = page.getByRole('form', { name: copy.heading })
  await form.getByLabel('Company').fill('Fake Company for e2e')
  await form.getByLabel('Team size').selectOption({ label: '11 to 50 people' })
  await form.getByLabel('Sector').fill('Fake sector')
  await form.getByLabel('Your name').fill('Fake Person')
  await form.getByLabel('Your role').fill('Fake role')
  await form.getByLabel('Work email').fill(email)
  await form.getByLabel('Mobile number').fill('98765 43210')
  if (tick) await form.getByRole('checkbox', { name: FAKE_NOTICE }).check()
  return form
}

/** Sends the form as a person would: no sooner than three seconds after the page was drawn. */
async function send(page: Page, drawnAt: number) {
  const wait = drawnAt + MIN_FILL_MS + 200 - Date.now()
  if (wait > 0) await page.waitForTimeout(wait)
  await page.getByRole('button', { name: copy.submit }).click()
}

async function open(page: Page): Promise<number> {
  await page.goto(`${PAGE}#${copy.anchor}`)
  await expect(page.getByRole('form', { name: copy.heading })).toBeVisible()
  return Date.now()
}

test.describe('The Team Map request', () => {
  test.beforeAll(async () => {
    const db = await cms()
    const notice = await db.create({
      collection: 'consent-versions',
      data: {
        purpose: 'enquiryReplies',
        language: 'en-IN',
        text: FAKE_NOTICE,
        effectiveFrom: new Date(Date.now() - 60_000).toISOString(),
      } as never,
      overrideAccess: true,
    })
    noticeId = notice.id as number
  })

  test.afterAll(async () => {
    const db = await cms()
    await db.delete({
      collection: 'enquiries',
      where: { 'submitted.email': { like: '@example.invalid' } },
      overrideAccess: true,
    })
    // A version in force is kept by the collection's own hook (docs/04); this fake one is
    // removed past it, straight from the database, as nothing names it.
    if (noticeId !== null) {
      await db.db.deleteOne({ collection: 'consent-versions', where: { id: { equals: noticeId } } })
    }
  })

  test('is a form with the consent text in force, unticked, and axe finds nothing serious', async ({
    page,
  }) => {
    await open(page)
    const form = page.getByRole('form', { name: copy.heading })
    for (const field of copy.fields) await expect(form.getByLabel(field.label)).toBeVisible()
    await expect(form.getByRole('checkbox', { name: FAKE_NOTICE })).not.toBeChecked()
    const results = await new AxeBuilder({ page }).include(`#${copy.anchor}`).analyze()
    expect(
      results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([])
  })

  test('refuses the unticked box with the error summary, which takes focus', async ({
    page,
  }, testInfo) => {
    const email = fakeEmail(testInfo.project.name, 'unticked')
    const drawnAt = await open(page)
    await fill(page, email, { tick: false })
    await send(page, drawnAt)
    const summary = page.locator('.iiic-error-summary')
    await expect(summary).toBeFocused()
    await expect(summary.getByRole('link', { name: FORM_MESSAGES.consent })).toHaveAttribute(
      'href',
      '#tm-consent',
    )
    // What was typed stays.
    await expect(page.getByLabel('Work email')).toHaveValue(email)
    const results = await new AxeBuilder({ page }).include(`#${copy.anchor}`).analyze()
    expect(
      results.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
    ).toEqual([])
    expect(await enquiriesFrom(email)).toBe(0)
  })

  test('gives a filled trap the acknowledgement and stores nothing', async ({ page }, testInfo) => {
    const email = fakeEmail(testInfo.project.name, 'trap')
    const drawnAt = await open(page)
    await fill(page, email)
    await page.locator('input[name="homepage"]').evaluate((input: HTMLInputElement) => {
      input.value = 'https://fake-robot.example'
    })
    await send(page, drawnAt)
    await expect(page.getByRole('status')).toBeFocused()
    await expect(page.getByRole('status')).toContainText(copy.acknowledgement.heading)
    expect(await enquiriesFrom(email)).toBe(0)
  })

  test('past the day’s limit for an email address, says IIIC has the requests and stores nothing', async ({
    page,
  }, testInfo) => {
    const email = fakeEmail(testInfo.project.name, 'limit')
    const db = await cms()
    for (let index = 0; index < 3; index += 1) {
      await db.create({
        collection: 'enquiries',
        data: {
          kind: 'teamMap',
          status: 'received',
          receivedAt: new Date(Date.now() - 60_000).toISOString(),
          submitted: {
            organisationName: 'Fake Company for e2e',
            contactName: 'Fake Person',
            email,
          },
        } as never,
        overrideAccess: true,
      })
    }
    const drawnAt = await open(page)
    await fill(page, email)
    await send(page, drawnAt)
    await expect(page.locator('.iiic-error-summary')).toContainText(REFUSALS.limit)
    expect(await enquiriesFrom(email)).toBe(3)
  })

  // ReceiveEnquiry is builder A's and is wired to the forms at the merge (docs/17 §12;
  // src/lib/enquiryForms/wiring.ts). Until then the form refuses politely and stores nothing.
  test.fixme('is received: the acknowledgement takes focus and the request is stored once', async ({
    page,
  }, testInfo) => {
    const email = fakeEmail(testInfo.project.name, 'received')
    const drawnAt = await open(page)
    await fill(page, email)
    await send(page, drawnAt)
    await expect(page.getByRole('status')).toBeFocused()
    await expect(page.getByRole('link', { name: 'Book a proposal call' })).toBeVisible()
    expect(await enquiriesFrom(email)).toBe(1)
  })

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false })

    test('posts to its page and answers there with the error summary', async ({
      page,
    }, testInfo) => {
      const email = fakeEmail(testInfo.project.name, 'no-script')
      const drawnAt = await open(page)
      await fill(page, email, { tick: false })
      await send(page, drawnAt)
      await expect(page).toHaveURL(new RegExp(`${PAGE}#${copy.anchor}$`))
      await expect(page.locator('.iiic-error-summary')).toContainText(FORM_MESSAGES.consent)
      await expect(page.getByLabel('Work email')).toHaveValue(email)
      expect(await enquiriesFrom(email)).toBe(0)
    })
  })
})
