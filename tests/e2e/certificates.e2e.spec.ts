import AxeBuilder from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { getPayload } from 'payload'
import { renderPageAsImage } from 'unpdf'

import { siteOrigin } from '../../src/lib/seo/site'
import config from '../../src/payload.config'
import { decodePage } from '../helpers/certificateQr'
import { assertLocalDatabase } from '../helpers/localDatabase'
import { login } from '../helpers/login'
import { testUser } from '../helpers/seedUser'

// Certificates end to end (docs/18 §4, §9; D-39). Every visitor: the verify pages refuse a
// malformed ID with a focused error summary and answer an unknown one plainly; the issue screen
// and every certificate route turn anonymous requests away. An owner (desktop project only, so
// the two projects never share the fake records): the issue screen opens, axe-clean, and
// previews; an issue makes a PDF whose QR code, read from the rendered page, opens a page that
// says Valid; after a revoke the same page says Revoked. Issuing needs M3's PDF renderer: until
// the branches are joined the issue answers "render-failed" and that part is skipped, saying so.

const ORIGIN = siteOrigin()
/** Payload reads the session cookie only when the request names an allowed origin. */
const asStaff = { headers: { Origin: ORIGIN } }

const owner = {
  name: 'Test Certificates Owner (fake)',
  email: 'certificates.owner.test@example.invalid',
  password: 'test-only-password-certificates',
  roles: ['owner' as const],
  totpSecret: testUser.totpSecret,
}
const PERSON = 'Example Certificate Learner'
const PROGRAMME = 'Example Programme (e2e, fake)'

async function blockingViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).analyze()
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => violation.id)
}

test.describe('The verify pages, for anyone', () => {
  test('a malformed ID is refused with a focused summary, and never looked up', async ({
    page,
  }) => {
    const response = await page.goto('/institute/verify?id=IIIC-C-2099-0001-0')
    expect(response?.headers()['x-robots-tag']).toContain('noindex')
    const summary = page.locator('.iiic-error-summary')
    await expect(summary).toBeFocused()
    await expect(page.getByLabel('Certificate ID')).toHaveAttribute('aria-invalid', 'true')
    expect(await blockingViolations(page)).toEqual([])
  })

  test('an unknown ID or link gets one plain answer', async ({ page }) => {
    await page.goto('/institute/verify?id=IIIC-C-2099-9999-1')
    await expect(page.getByRole('heading', { name: 'No certificate matches' })).toBeVisible()
    await page.goto('/institute/verify/AAAAAAAAAAAAAAAAAAAAAA')
    await expect(page.getByRole('heading', { name: 'No certificate matches' })).toBeVisible()
  })

  test('the page fits a 320 px phone without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto('/institute/verify')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})

test.describe('The certificates screen and routes refuse anonymous requests', () => {
  test('the screen sends a visitor to the sign-in', async ({ page }) => {
    await page.goto('/admin/certificates/issue')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('every route answers 401 without a session', async ({ request }) => {
    const answers = await Promise.all([
      request.post('/api/certificates/preview', { data: {}, ...asStaff }),
      request.post('/api/certificates/issue', { data: {}, ...asStaff }),
      request.post('/api/certificates/1/revoke', { data: { reason: 'Fake reason' }, ...asStaff }),
      request.post('/api/certificates/1/reissue', { data: { reason: 'Fake reason' }, ...asStaff }),
      request.get('/api/certificates/1/pdf'),
      request.get('/api/certificates/recipients?q=Example'),
    ])
    for (const answer of answers) expect(answer.status()).toBe(401)
  })
})

test.describe('An owner issues, the QR code verifies, a revoke shows at once', () => {
  test.describe.configure({ mode: 'serial' })
  let personId = 0
  let restoreSignatory: { signatoryName: string | null; signatoryTitle: string | null } | null =
    null

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== 'desktop') return
    assertLocalDatabase()
    const payload = await getPayload({ config })
    await payload.delete({ collection: 'users', where: { email: { equals: owner.email } } })
    await payload.create({ collection: 'users', data: owner })
    await payload.delete({ collection: 'people', where: { fullName: { equals: PERSON } } })
    personId = (await payload.create({ collection: 'people', data: { fullName: PERSON } })).id
    const settings = await payload.findGlobal({ slug: 'settings', depth: 0 })
    if (!settings.certificates?.signatoryName || !settings.certificates?.signatoryTitle) {
      restoreSignatory = {
        signatoryName: settings.certificates?.signatoryName ?? null,
        signatoryTitle: settings.certificates?.signatoryTitle ?? null,
      }
      await payload.updateGlobal({
        slug: 'settings',
        data: {
          certificates: {
            signatoryName: 'Example Signatory (fake)',
            signatoryTitle: 'Example Title (fake)',
          },
        },
      })
    }
  })

  test.afterAll(async ({}, testInfo) => {
    if (testInfo.project.name !== 'desktop') return
    const payload = await getPayload({ config })
    const { docs } = await payload.find({
      collection: 'certificates',
      where: { programmeName: { equals: PROGRAMME } },
      pagination: false,
      depth: 0,
    })
    for (const doc of [...docs].sort((a, b) => b.id - a.id)) {
      await payload.delete({ collection: 'certificates', id: doc.id })
    }
    await payload.delete({ collection: 'people', where: { fullName: { equals: PERSON } } })
    await payload.delete({ collection: 'users', where: { email: { equals: owner.email } } })
    if (restoreSignatory) {
      await payload.updateGlobal({ slug: 'settings', data: { certificates: restoreSignatory } })
    }
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Issued once, on the desktop project.')
  })

  test('the issue screen opens, axe-clean, and previews a certificate', async ({ page }) => {
    await login(page, owner)
    await page.goto('/admin/certificates/issue')
    await expect(page.getByRole('heading', { level: 1, name: 'Issue certificates' })).toBeVisible()
    await page.getByLabel('Programme', { exact: true }).fill(PROGRAMME)
    await page.getByLabel('Completed on').fill('2099-03-30')
    await page.getByLabel('Find a person').fill('Example Certificate')
    await page.getByRole('button', { name: 'Search' }).click()
    await page.getByRole('button', { name: `Add ${PERSON}` }).click()
    await page.getByRole('button', { name: 'Preview certificates' }).click()
    await expect(page.getByRole('heading', { name: 'Preview' })).toBeFocused()
    await expect(page.locator(`iframe[title="Certificate preview for ${PERSON}"]`)).toBeVisible()
    expect(await blockingViolations(page)).toEqual([])
  })

  test('an issued PDF’s QR code opens a page that says Valid, then Revoked', async ({ page }) => {
    await login(page, owner)
    const api: APIRequestContext = page.request
    const issued = await api.post('/api/certificates/issue', {
      ...asStaff,
      data: {
        programmeName: PROGRAMME,
        completedOn: '2099-03-30',
        recipients: [{ personId, nameAsPrinted: PERSON }],
      },
    })
    const answer = (await issued.json()) as {
      code?: string
      issued?: { id: number; certificateId: string }[]
    }
    test.skip(
      issued.status() === 503 && answer.code === 'render-failed',
      'Waits for M3’s PDF renderer (src/lib/pdf), joined after this branch.',
    )
    expect(issued.status()).toBe(200)
    const made = answer.issued?.[0] as { id: number; certificateId: string }

    const file = await api.get(`/api/certificates/${made.id}/pdf`, asStaff)
    expect(file.status()).toBe(200)
    expect(file.headers()['content-type']).toBe('application/pdf')
    const png = await renderPageAsImage(new Uint8Array(await file.body()), 1, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale: 3,
    })
    const link = await decodePage(png)
    expect(link).toMatch(/\/institute\/verify\/[A-Za-z0-9_-]{22}$/)
    const path = new URL(link as string).pathname

    await page.goto(path)
    await expect(
      page.getByRole('heading', { name: `Certificate ${made.certificateId}` }),
    ).toBeVisible()
    await expect(page.getByText('Valid', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(PERSON)).toBeVisible()

    const revoked = await api.post(`/api/certificates/${made.id}/revoke`, {
      ...asStaff,
      data: { reason: 'Issued in an end-to-end test (fake)' },
    })
    expect(revoked.status()).toBe(200)
    await page.goto(path)
    await expect(page.getByText('Revoked', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Issued in an end-to-end test')).toHaveCount(0)

    // By its typed ID the page shows initials only.
    await page.goto(`/institute/verify?id=${made.certificateId.toLowerCase()}`)
    await expect(page.getByText(PERSON)).toHaveCount(0)
    await expect(page.getByText('Revoked', { exact: true }).first()).toBeVisible()
  })
})
