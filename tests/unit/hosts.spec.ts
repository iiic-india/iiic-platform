import { describe, expect, it } from 'vitest'

import { instituteRewrite, parseHosts } from '@/lib/hosts'

describe('parseHosts', () => {
  it('reads a comma-separated list, trimmed and in lower case', () => {
    expect(parseHosts(' IIIC.edu.in, www.iiic.edu.in ,,')).toEqual(
      new Set(['iiic.edu.in', 'www.iiic.edu.in']),
    )
  })

  it('is empty when the variable is unset or empty', () => {
    expect(parseHosts(undefined).size).toBe(0)
    expect(parseHosts('').size).toBe(0)
  })
})

describe('instituteRewrite', () => {
  const institute = parseHosts('iiic.edu.in,www.iiic.edu.in')

  it('leaves the platform host alone', () => {
    expect(instituteRewrite('iiic.example', '/framework', institute)).toBeNull()
    expect(instituteRewrite(null, '/', institute)).toBeNull()
  })

  it('serves an institute host from /institute', () => {
    expect(instituteRewrite('iiic.edu.in', '/', institute)).toBe('/institute')
    expect(instituteRewrite('www.iiic.edu.in', '/verify', institute)).toBe('/institute/verify')
    expect(instituteRewrite('IIIC.EDU.IN', '/research', institute)).toBe('/institute/research')
  })

  it('does not rewrite twice, and the admin finds nothing there', () => {
    expect(instituteRewrite('iiic.edu.in', '/institute/verify', institute)).toBeNull()
    expect(instituteRewrite('iiic.edu.in', '/admin', institute)).toBe('/institute/admin')
  })

  it('changes nothing while no institute host is configured', () => {
    expect(instituteRewrite('iiic.edu.in', '/verify', parseHosts(''))).toBeNull()
  })
})
