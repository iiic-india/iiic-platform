import { expect, test } from '@playwright/test'

// The cookie inventory (docs/12 §10). A cookie that is not listed there fails these tests
// until the inventory and the privacy notice's cookie section list it. Signing in to the admin
// is covered in admin.e2e.spec.ts, which owns the test account.

test('a page in every route group, Find your path, the 404 and the admin sign-in page set no cookie', async ({
  page,
  context,
}) => {
  // A page in each route group (default, consultancy, counselling, education), a legal page,
  // Find your path's question and an address that tries to carry its answer, the 404 and the
  // admin's sign-in page.
  for (const path of [
    '/',
    '/privacy',
    '/map',
    '/map/go?who=yourself',
    '/organisations',
    '/counselling',
    '/learn',
    '/no-such-page',
    '/admin/login',
  ]) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
  }
  // The answer itself is posted, and counted with no cookie (the privacy notice; docs/12 §10).
  // The page's request context shares the browser's cookies, so a cookie set here is caught.
  const answer = await page.request.post('/map/go', { form: { who: 'yourself' }, maxRedirects: 0 })
  expect(answer.status()).toBe(303)
  expect(answer.headers()['set-cookie']).toBeUndefined()
  expect(await context.cookies()).toEqual([])
})

test('the owner setup link sets only its own ten-minute cookie, for one request path (D-41)', async ({
  request,
}) => {
  const token = process.env.OWNER_SETUP_TOKEN
  test.skip(!token, 'Needs OWNER_SETUP_TOKEN for the server under test (CI sets one).')

  const wrong = await request.get('/api/owner-setup?token=not-the-token', { maxRedirects: 0 })
  expect(wrong.status()).toBe(404)
  expect(wrong.headers()['set-cookie']).toBeUndefined()

  const right = await request.get(`/api/owner-setup?token=${token}`, { maxRedirects: 0 })
  expect(right.status()).toBe(303)
  // The token is in the link's query: no referrer leaves this response.
  expect(right.headers()['referrer-policy']).toBe('no-referrer')
  const cookies = right.headersArray().filter(({ name }) => name.toLowerCase() === 'set-cookie')
  expect(cookies).toHaveLength(1)
  const cookie = cookies[0]?.value ?? ''
  expect(cookie).toMatch(/^iiic-owner-setup=/)
  expect(cookie).toMatch(/;\s*Path=\/api\/users\/first-register(;|$)/i)
  expect(cookie).toMatch(/;\s*Max-Age=600(;|$)/i)
  expect(cookie).toMatch(/;\s*HttpOnly(;|$)/i)
  expect(cookie).toMatch(/;\s*SameSite=Strict(;|$)/i)
})
