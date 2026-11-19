// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeAll, describe, expect, it } from 'vitest'

// Obviously fake test values, set before the route reads its environment.
const TOKEN = 'test-only-owner-setup-token-0000000000'
let GET: typeof import('@/app/api/owner-setup/route').GET

beforeAll(async () => {
  process.env.PAYLOAD_SECRET = 'test-only-payload-secret-00000000000000'
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/iiic_test'
  process.env.OWNER_SETUP_TOKEN = TOKEN
  ;({ GET } = await import('@/app/api/owner-setup/route'))
})

const request = (query: string) =>
  new NextRequest(`https://iiic-platform.example.invalid/api/owner-setup${query}`)

describe('GET /api/owner-setup', () => {
  it('answers 404 without the right token', () => {
    for (const query of ['', '?token=', '?token=guess']) {
      const response = GET(request(query))
      expect(response.status).toBe(404)
      expect(response.headers.get('set-cookie')).toBeNull()
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('sets a short-lived cookie for first-user registration and opens the setup screen', () => {
    const response = GET(request(`?token=${TOKEN}`))
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://iiic-platform.example.invalid/admin/create-first-user',
    )
    const setCookie = response.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`iiic-owner-setup=${TOKEN}`)
    expect(setCookie).toContain('Path=/api/users/first-register')
    expect(setCookie).toContain('Max-Age=600')
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Secure/i)
    expect(setCookie).toMatch(/SameSite=strict/i)
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })
})
