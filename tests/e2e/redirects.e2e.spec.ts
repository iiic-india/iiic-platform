import { expect, test } from '@playwright/test'
import { getPayload, type Payload } from 'payload'

import config from '../../src/payload.config'
import { assertLocalDatabase } from '../helpers/localDatabase'
import { login } from '../helpers/login'

// The 404 log, security.txt and a redirect made in the admin, against the running site
// (docs/11 §5.1, item 9, §5.5; docs/12 §3). Data is written through the local API, as the other
// end-to-end tests write their accounts: obviously fake, and removed afterwards.

/** Letters only: an address with a long run of digits is never logged (src/lib/redirects). */
const letters = () =>
  Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('')

let payload: Payload
async function cms(): Promise<Payload> {
  assertLocalDatabase()
  payload ??= await getPayload({ config })
  return payload
}

const DAY = 24 * 60 * 60 * 1000

// Checks that only make requests: once, in the desktop project.
test.describe('The 404 log and security.txt', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'These checks only make requests: the desktop project runs them',
  )

  test('a missing address is answered with a 404 and logged after it, without its query', async ({
    request,
  }) => {
    const path = `/e2e-missing-${letters()}`
    const response = await request.get(
      `${path}?utm_source=fake&email=fake.person%40example.invalid`,
      { headers: { referer: 'https://fake-partner.example/news/item?id=7' } },
    )
    expect(response.status()).toBe(404)

    const db = await cms()
    const logged = async () => {
      const { docs } = await db.find({
        collection: 'missing-pages',
        where: { path: { equals: path } },
        depth: 0,
      })
      return docs[0] ? { hits: docs[0].hits, referrerHost: docs[0].referrerHost } : null
    }
    // Written once the response has gone.
    await expect.poll(logged, { timeout: 15_000 }).toEqual({
      hits: 1,
      referrerHost: 'fake-partner.example',
    })
    // Nothing of the query, and nothing about the visitor, anywhere in the log.
    for (const word of ['utm_source', 'example.invalid', 'news/item']) {
      const { totalDocs } = await db.count({
        collection: 'missing-pages',
        where: { or: [{ path: { like: word } }, { referrerHost: { like: word } }] },
      })
      expect(totalDocs, word).toBe(0)
    }
    await db.delete({ collection: 'missing-pages', where: { path: { equals: path } } })
  })

  test('a page that is served is never logged, however often it is viewed', async ({ request }) => {
    // Next.js renders the 404 page's component along with every page, so only the route that
    // answers with the 404 may write the log (src/lib/redirects/lookup.ts).
    const served = ['/', '/about', '/framework', '/counselling', '/privacy']
    for (const path of served) {
      for (let view = 0; view < 2; view += 1) {
        expect((await request.get(path)).status(), path).toBe(200)
      }
    }
    // A missing address after them: once its entry is written, so would theirs have been.
    const missing = `/e2e-after-views-${letters()}`
    expect((await request.get(missing)).status()).toBe(404)
    const db = await cms()
    const entries = async (paths: string[]) =>
      (await db.count({ collection: 'missing-pages', where: { path: { in: paths } } })).totalDocs
    await expect.poll(() => entries([missing]), { timeout: 15_000 }).toBe(1)
    expect(await entries(served)).toBe(0)
    await db.delete({ collection: 'missing-pages', where: { path: { equals: missing } } })
  })

  test('security.txt says where to report a problem, and does not expire', async ({ request }) => {
    const response = await request.get('/.well-known/security.txt')
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('text/plain; charset=utf-8')
    const text = await response.text()
    expect(text).toMatch(/^Contact: mailto:[^\s@]+@[^\s@]+$/m)
    expect(text).toMatch(/^Preferred-Languages: en$/m)
    expect(text).toMatch(/^Canonical: https:\/\/imagecatalysts\.in\/\.well-known\/security\.txt$/m)
    const expires = Date.parse(/^Expires: (.+)$/m.exec(text)?.[1] ?? '')
    expect(expires - Date.now()).toBeGreaterThan(363 * DAY)
    expect(expires - Date.now()).toBeLessThanOrEqual(365 * DAY)
  })
})

/** An owner of this file's own, with Google Authenticator's documented example key. Obviously fake. */
const owner = {
  name: 'Test Redirects Owner (fake)',
  email: 'redirects.owner.test@example.invalid',
  password: 'test-only-password-redirects',
  roles: ['owner' as const],
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
}

test.describe('A redirect made in the admin', () => {
  test.skip(({ isMobile }) => isMobile, 'One redirect per address: the desktop project runs it')
  test.describe.configure({ mode: 'serial' })

  const from = `/e2e-old-address-${letters()}`

  test.beforeAll(async () => {
    const db = await cms()
    await db.delete({ collection: 'users', where: { email: { equals: owner.email } } })
    await db.create({ collection: 'users', data: owner })
  })

  test.afterAll(async () => {
    const db = await cms()
    await db.delete({ collection: 'redirects', where: { from: { equals: from } } })
    await db.delete({ collection: 'missing-pages', where: { path: { equals: from } } })
    await db.delete({ collection: 'users', where: { email: { equals: owner.email } } })
  })

  test('is followed from the next request, and the address is a 404 again once it goes', async ({
    page,
  }) => {
    await login(page, owner)
    // Through the admin's own API, so the server marks its cached redirects stale. Payload reads
    // the session cookie only from a request that names its origin (its csrf list), as a
    // browser's does; Playwright's request sends no Origin of its own.
    const sameOrigin = { Origin: new URL(page.url()).origin }
    const created = await page.request.post('/api/redirects', {
      headers: sameOrigin,
      data: { from, to: { type: 'custom', url: '/about' }, type: '308' },
    })
    expect(created.status()).toBe(201)
    const { doc } = (await created.json()) as { doc: { id: number } }

    const followed = await page.request.get(from, { maxRedirects: 0 })
    expect(followed.status()).toBe(308)
    expect(new URL(followed.headers()['location'] ?? '', 'http://site.invalid').pathname).toBe(
      '/about',
    )
    await page.goto(from)
    await expect(page).toHaveURL(/\/about$/)

    const removed = await page.request.delete(`/api/redirects/${doc.id}`, { headers: sameOrigin })
    expect(removed.status()).toBe(200)
    expect((await page.request.get(from, { maxRedirects: 0 })).status()).toBe(404)
  })
})
