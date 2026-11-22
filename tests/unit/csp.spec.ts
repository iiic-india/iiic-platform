// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildCsp, createNonce } from '@/lib/security/csp'

const directives = (csp: string) =>
  new Map(
    csp.split('; ').map((directive) => {
      const [name, ...values] = directive.split(' ')
      return [name, values] as const
    }),
  )

describe('buildCsp', () => {
  const build = buildCsp({ nonce: 'test-nonce', development: false, https: true })

  it('lets scripts run only with the nonce, and what they load', () => {
    expect(directives(build).get('script-src')).toEqual([
      "'self'",
      "'nonce-test-nonce'",
      "'strict-dynamic'",
    ])
    expect(build).not.toContain("'unsafe-eval'")
    expect(directives(build).get('script-src')).not.toContain("'unsafe-inline'")
  })

  it('keeps everything else to this origin, with no plugins, framing, base or foreign forms', () => {
    const policy = directives(build)
    expect(policy.get('default-src')).toEqual(["'self'"])
    expect(policy.get('connect-src')).toEqual(["'self'"])
    expect(policy.get('font-src')).toEqual(["'self'"])
    expect(policy.get('img-src')).toEqual(["'self'", 'data:', 'blob:'])
    expect(policy.get('frame-src')).toEqual(["'none'"])
    expect(policy.get('object-src')).toEqual(["'none'"])
    expect(policy.get('base-uri')).toEqual(["'self'"])
    expect(policy.get('form-action')).toEqual(["'self'"])
    expect(policy.get('frame-ancestors')).toEqual(["'none'"])
  })

  it('lets images load from the media bucket too, and nothing else widens (D-46)', () => {
    const withMedia = buildCsp({
      nonce: 'n',
      development: false,
      https: true,
      imageOrigins: ['https://media.example'],
    })
    expect(directives(withMedia).get('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://media.example',
    ])
    expect(directives(withMedia).get('default-src')).toEqual(["'self'"])
    const without = directives(buildCsp({ nonce: 'n', development: false, https: true }))
    for (const [name, values] of directives(withMedia)) {
      if (name !== 'img-src') expect(values, name).toEqual(without.get(name))
    }
  })

  it('allows inline styles, which cannot run code (the admin injects them at runtime)', () => {
    expect(directives(build).get('style-src')).toEqual(["'self'", "'unsafe-inline'"])
  })

  it('upgrades insecure requests only over https', () => {
    expect(directives(build).has('upgrade-insecure-requests')).toBe(true)
    const plain = buildCsp({ nonce: 'n', development: false, https: false })
    expect(directives(plain).has('upgrade-insecure-requests')).toBe(false)
  })

  it('lets the admin frame a draft-mode page and the admin frame this origin, when asked (OS-4)', () => {
    const framed = directives(
      buildCsp({ nonce: 'n', development: false, https: true, frameAncestors: "'self'" }),
    )
    expect(framed.get('frame-ancestors')).toEqual(["'self'"])
    expect(framed.get('frame-src')).toEqual(["'none'"])
    const admin = directives(
      buildCsp({ nonce: 'n', development: false, https: true, frameSources: "'self'" }),
    )
    expect(admin.get('frame-src')).toEqual(["'self'"])
    expect(admin.get('frame-ancestors')).toEqual(["'none'"])
  })

  it('adds a third-party script and where it reports only when given (the beacon)', () => {
    const beacon = directives(
      buildCsp({
        nonce: 'n',
        development: false,
        https: true,
        scriptOrigins: ['https://static.cloudflareinsights.com'],
        connectOrigins: ['https://cloudflareinsights.com'],
      }),
    )
    expect(beacon.get('script-src')).toEqual([
      "'self'",
      "'nonce-n'",
      "'strict-dynamic'",
      'https://static.cloudflareinsights.com',
    ])
    expect(beacon.get('connect-src')).toEqual(["'self'", 'https://cloudflareinsights.com'])
    expect(beacon.get('img-src')).toEqual(["'self'", 'data:', 'blob:'])
  })

  it('adds eval for next dev only', () => {
    const dev = buildCsp({ nonce: 'n', development: true, https: false })
    expect(directives(dev).get('script-src')).toContain("'unsafe-eval'")
  })
})

describe('createNonce', () => {
  it('is 128 random bits in base64, new every time', () => {
    const nonce = createNonce()
    expect(Buffer.from(nonce, 'base64')).toHaveLength(16)
    expect(new Set(Array.from({ length: 50 }, createNonce)).size).toBe(50)
  })
})
