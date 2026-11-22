// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { OLD_SITE_HOST, OLD_SITE_MAP, oldSiteRedirects } from '@/lib/redirects/oldSite'
import { PRODUCTION_ORIGIN } from '@/lib/seo/site'

vi.mock('@payloadcms/next/withPayload', () => ({ withPayload: (config: object) => config }))
vi.mock('@sentry/nextjs/config', () => ({ withSentryConfig: (config: object) => config }))

// The old site's addresses (docs/02, Redirects; docs/content/sources/old-site-iiicedu-com.md):
// host-based rules in next.config.ts that change nothing until iiicedu.com points here.

const hostMatches = (host: string) => new RegExp(`^${OLD_SITE_HOST}$`).test(host)

describe('the old site’s redirects', () => {
  const rules = oldSiteRedirects()

  it('follow the redirect map in the source, page by page', () => {
    const source = readFileSync(
      join(process.cwd(), 'docs/content/sources/old-site-iiicedu-com.md'),
      'utf8',
    )
    const map = source.slice(source.indexOf('## Redirect map'))
    // Every page-by-page row of the map, with its trailing slash, as the source writes it.
    for (const { from, to } of OLD_SITE_MAP.filter(({ from }) => !from.endsWith(':path*'))) {
      expect(map, from).toContain(`| \`${from}/\` | \`${to}\` |`)
    }
    for (const section of ['ova_sev', 'ova_por', 'ova_dep']) {
      expect(OLD_SITE_MAP).toContainEqual({ from: `/${section}/:path*`, to: '/' })
    }
  })

  it('send each old page to its successor on the platform, permanently', () => {
    expect(rules).toContainEqual({
      source: '/about-2',
      has: [{ type: 'host', value: OLD_SITE_HOST }],
      destination: `${PRODUCTION_ORIGIN}/about`,
      statusCode: 301,
    })
    expect(rules).toContainEqual(
      expect.objectContaining({
        source: '/individual-excellence',
        destination: `${PRODUCTION_ORIGIN}/counselling`,
      }),
    )
  })

  it('send everything else home, last', () => {
    expect(rules.at(-1)).toEqual({
      source: '/:path*',
      has: [{ type: 'host', value: OLD_SITE_HOST }],
      destination: `${PRODUCTION_ORIGIN}/`,
      statusCode: 301,
    })
    expect(rules).toHaveLength(OLD_SITE_MAP.length + 1)
  })

  it('match only iiicedu.com, with or without www, so this site is never redirected', () => {
    for (const rule of rules) expect(rule.has).toEqual([{ type: 'host', value: OLD_SITE_HOST }])
    expect(hostMatches('iiicedu.com')).toBe(true)
    expect(hostMatches('www.iiicedu.com')).toBe(true)
    for (const host of [
      'imagecatalysts.in',
      'www.imagecatalysts.in',
      'localhost',
      'iiicedu.com.evil.example',
      'notiiicedu.com',
      'iiiceduXcom',
    ]) {
      expect(hostMatches(host), host).toBe(false)
    }
  })

  it('are the redirects next.config.ts gives Next.js', async () => {
    const { default: config } = await import('../../next.config')
    expect(await config.redirects?.()).toEqual(rules)
  })
})
