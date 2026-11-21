import { expect, test } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config'

// The trust layer as a visitor meets it: the footer's legal row and /legal, read from the
// settings (docs/04 `settings`; docs/08 §3, §4), Find your path counting its answers without
// slowing them (docs/03 F1; docs/12 §7), and people, consents and the settings kept from every
// public surface. CI's database is empty and migrated, so the settings hold no legal information
// and every detail is its placeholder.

const LEGAL_LINKS = ['Legal', 'Privacy', 'Terms', 'Refunds', 'Grievance officer', 'Accessibility']

test.describe('The legal information', () => {
  test('the footer still carries its legal row: the proprietor, the GSTIN and the grievance officer', async ({
    page,
  }) => {
    await page.goto('/')
    const row = page.locator('footer .iiic-footer-legal')
    await expect(row).toContainText('Indian Institute of Image Catalysts · Legal name:')
    await expect(row).toContainText(' · GSTIN ')
    await expect(row).toContainText(' · Grievance officer: ')
    // While the settings hold none of them, each is its placeholder, and the affiliation
    // statement waits on the lawyer (I-26, I-05, I-21, I-30).
    await expect(row.locator('.iiic-todo')).toHaveCount(4)
    for (const id of ['I-26', 'I-05', 'I-21', 'I-30']) {
      await expect(row.locator(`.iiic-todo[data-todo="${id}"]`), id).toHaveCount(1)
    }
    for (const name of LEGAL_LINKS) {
      await expect(row.getByRole('link', { name, exact: true }), name).toBeVisible()
    }
  })

  test('/legal sets out who runs the site, a row for each detail', async ({ page }) => {
    const response = await page.goto('/legal')
    expect(response?.status()).toBe(200)
    const table = page.getByRole('region', { name: 'Who runs this site' })
    await expect(table.getByRole('rowheader')).toHaveText([
      'Trade name',
      'Legal name',
      'Kind of business',
      'Address',
      'Website',
      'GSTIN',
      'Customer care',
      'Grievance officer',
      'CERT-In point of contact',
      'Dark-pattern self-audit',
    ])
    await expect(table).toContainText('Sole proprietorship')
    await expect(table).toContainText('info@iiicedu.com')
    for (const id of ['I-26', 'I-33', 'I-05', 'I-21', 'I-27', 'I-22']) {
      await expect(table.locator(`.iiic-todo[data-todo="${id}"]`).first(), id).toBeVisible()
    }
    // Still a draft for IIIC's lawyer (D-52).
    await expect(page.locator('[data-draft="I-22"]')).toHaveText(
      'Draft page, awaiting legal review (I-22)',
    )
  })
})

test.describe('Requests only', () => {
  test.skip(({ isMobile }) => isMobile, 'A request is the same from a phone: once is enough.')

  test('Find your path still sends an answer on at once, and counts it with nothing about the visitor', async ({
    request,
  }) => {
    // A second of slack for the two clocks of one machine.
    const since = new Date(Date.now() - 1000).toISOString()
    const response = await request.post('/map/go', {
      form: { who: 'family' },
      maxRedirects: 0,
      headers: { 'user-agent': 'Fake browser (trust.e2e)' },
    })
    expect(response.status()).toBe(303)
    expect(response.headers()['location']).toBe('/counselling')
    expect(response.headers()['set-cookie']).toBeUndefined()

    // The count is written after the answer has gone.
    const payload = await getPayload({ config })
    const counted = async () =>
      payload.find({
        collection: 'analytics-events',
        where: {
          and: [
            { name: { equals: 'step0' } },
            { whoFor: { equals: 'family' } },
            { at: { greater_than_equal: since } },
          ],
        },
        depth: 0,
      })
    await expect
      .poll(async () => (await counted()).totalDocs, { timeout: 10_000 })
      .toBeGreaterThan(0)
    const [event] = (await counted()).docs
    expect(event).toMatchObject({ route: '/map', register: 'default' })
    expect(JSON.stringify(event)).not.toContain('Fake browser')
  })

  test('an answer that is not one of the three is neither counted nor sent anywhere but back', async ({
    request,
  }) => {
    const response = await request.post('/map/go', { form: { who: 'everyone' }, maxRedirects: 0 })
    expect(response.status()).toBe(303)
    expect(response.headers()['location']).toBe('/map')
  })

  test('people, consents, consent texts, events and the settings stay out of the public API', async ({
    request,
  }) => {
    for (const path of [
      '/api/people',
      '/api/consents',
      '/api/consent-versions',
      '/api/analytics-events',
      '/api/globals/settings',
    ]) {
      const response = await request.get(path)
      expect(response.status(), path).toBeGreaterThanOrEqual(400)
      expect(response.status(), path).toBeLessThan(500)
      const body = await response.text()
      expect(body, path).not.toContain('"docs"')
      expect(body, path).not.toContain('"legal"')
    }
  })
})
