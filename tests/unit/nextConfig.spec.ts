// @vitest-environment node
import { withSentryConfig } from '@sentry/nextjs/config'
import { expect, it, vi } from 'vitest'

import { CONTENT_LANGUAGE, headerRules } from '@/lib/security/headers'
import { HTML_LIMITED_BOTS } from '@/lib/seo/bots'

vi.mock('@payloadcms/next/withPayload', () => ({ withPayload: (config: object) => config }))
vi.mock('@sentry/nextjs/config', () => ({ withSentryConfig: vi.fn((config: object) => config) }))

it("keeps Sentry's managed tunnel route out of the build (D-49)", async () => {
  await import('../../next.config')
  expect(vi.mocked(withSentryConfig).mock.calls[0]?.[1]).toMatchObject({ tunnelRoute: false })
})

it('hands Next.js the crawlers that get each page in one piece (src/lib/seo/bots.ts)', async () => {
  const { default: config } = await import('../../next.config')
  // Setting the option replaces Next.js's own list, so the whole list is passed.
  expect(config.htmlLimitedBots).toBe(HTML_LIMITED_BOTS)
})

it('sends the header rules of src/lib/security/headers.ts, the page language among them', async () => {
  const { default: config } = await import('../../next.config')
  const rules = await config.headers?.()
  expect(rules).toEqual(headerRules(process.env.VERCEL_ENV, process.env.SEARCH_INDEXING))
  expect(rules).toContainEqual(CONTENT_LANGUAGE)
})
