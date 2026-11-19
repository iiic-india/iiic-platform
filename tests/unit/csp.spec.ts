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

  it('allows inline styles, which cannot run code (the admin injects them at runtime)', () => {
    expect(directives(build).get('style-src')).toEqual(["'self'", "'unsafe-inline'"])
  })

  it('upgrades insecure requests only over https', () => {
    expect(directives(build).has('upgrade-insecure-requests')).toBe(true)
    const plain = buildCsp({ nonce: 'n', development: false, https: false })
    expect(directives(plain).has('upgrade-insecure-requests')).toBe(false)
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
