// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Turnstile's origins join the page's policy only where both its keys are set (docs/17 §6). The
// environment is read once per process (src/lib/env.ts), so each case loads the proxy afresh.
// Obviously fake values.
const BASE = {
  PAYLOAD_SECRET: 'test-only-payload-secret-00000000000000',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/iiic_test',
}
const KEYS = { TURNSTILE_SITE_KEY: 'fake-site-key', TURNSTILE_SECRET_KEY: 'fake-secret-key' }
const ORIGIN = 'https://challenges.cloudflare.com'

async function cspWith(
  variables: Record<string, string>,
  url: string,
): Promise<Map<string, string[]>> {
  vi.resetModules()
  for (const [name, value] of Object.entries(variables)) vi.stubEnv(name, value)
  const { proxy } = await import('@/proxy')
  const csp = (await proxy(new NextRequest(url))).headers.get('content-security-policy') ?? ''
  return new Map(
    csp.split('; ').map((directive) => {
      const [name, ...values] = directive.split(' ')
      return [name as string, values]
    }),
  )
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('TURNSTILE_SITE_KEY', '')
  vi.stubEnv('TURNSTILE_SECRET_KEY', '')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('the policy on a page with a form', () => {
  it('lets Turnstile’s script and frame in where its keys are set', async () => {
    const csp = await cspWith({ ...BASE, ...KEYS }, 'https://iiic.example/organisations/team-map')
    expect(csp.get('script-src')).toContain(ORIGIN)
    expect(csp.get('frame-src')).toEqual([ORIGIN])
  })

  it('keeps Turnstile out of the admin', async () => {
    const csp = await cspWith({ ...BASE, ...KEYS }, 'https://iiic.example/admin')
    expect(csp.get('script-src')).not.toContain(ORIGIN)
    expect(csp.get('frame-src')).toEqual(["'self'"])
  })

  it('names no Turnstile origin without its keys', async () => {
    const csp = await cspWith(BASE, 'https://iiic.example/organisations/team-map')
    expect(csp.get('script-src')).not.toContain(ORIGIN)
    expect(csp.get('frame-src')).toEqual(["'none'"])
  })
})
